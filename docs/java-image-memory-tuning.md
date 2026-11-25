# Java image memory tuning

The Java images (`java-17-standalone`, `java-17-artemis`, `java-25-standalone`, `java-25-artemis`) cap every resident JVM and node process so that many student environments can run per host. Without this tuning, a hello-world environment settles above 2GB: two JDT language server JVMs (redhat.java 1.56 defaults to `-Xmx2G`), up to three Gradle daemons (512MB each, 3h idle timeout, unable to share because they run on different JVMs), and uncapped node processes.

## Where each knob lives

| Knob | File | Applied to |
|---|---|---|
| `org.gradle.jvmargs`, `org.gradle.java.home`, daemon idle timeout, workers | `images/java-{17,25}/gradle/gradle.properties` -> baked to `~/.gradle/gradle.properties` | Both Gradle daemons (IDE import + terminal) |
| Test JVM heap cap (Gradle) | `images/java-{17,25}/gradle/test-memory.gradle` -> baked to `~/.gradle/init.d/` | Any Gradle project, incl. mounted course repos |
| `java.jdt.ls.vmargs`, `java.server.launchMode` | `images/java-{17,25}/theia/user-settings.json` -> baked to `/home/theia/.theia-ide/settings.json` | JDT language server |
| `MAVEN_OPTS`, `NODE_OPTIONS`, `MALLOC_ARENA_MAX` | `ENV` block in both `ToolDockerfile`s | Maven, Theia node processes, all glibc processes |
| Surefire test JVM heap cap | `templates/maven/pom.xml` (`argLine`) | Maven test forks (Surefire does not inherit `MAVEN_OPTS`) |
| Debuggee heap cap | `templates/*/.vscode/launch.json` (`vmArgs`) | The student's app under debug |

Each Java version directory carries its own copy of the three tuning files (same pattern as `remote-cache.gradle`); the templates in `images/java-*/templates` are copied into the same image. Keep the copies in sync unless a version deliberately diverges.

## The one-daemon invariant

The IDE's Java extension imports Gradle projects through the Gradle Tooling API, which starts its own daemon. A terminal `./gradlew` starts another. Gradle only reuses a daemon when Gradle version, java home, and daemon JVM args all match.

Two things make the daemons identical so they share:

1. `java.import.gradle.jvmArguments` is unset, so the import daemon reads `org.gradle.jvmargs` from `~/.gradle/gradle.properties`, exactly like the terminal daemon.
2. `org.gradle.java.home=/home/theia/jdk` pins both daemons to the same JVM (the symlink is created in the `ToolDockerfile` and points to the container JDK). Without this pin, the import daemon runs on redhat.java's **embedded JRE 21** while the terminal daemon runs on the system JDK 17, and they can never share; measurements showed three daemons piling up that way.

**Never set `java.import.gradle.jvmArguments` in IDE settings. Change `org.gradle.jvmargs` in `images/java-17/gradle/gradle.properties` instead.** Setting it splits the import back into a second daemon (~350MB) and triggers a security prompt in the Java extension.

Edge case: if `./gradlew` runs while the import daemon is busy, Gradle briefly starts a second daemon; the 2-minute idle timeout reaps the spare.

## Why G1 with periodic GC for the language server

The JDT LS vmargs use `-XX:+UseG1GC -XX:G1PeriodicGCInterval=30000 -XX:-G1PeriodicGCInvokesConcurrent -XX:MinHeapFreeRatio=10 -XX:MaxHeapFreeRatio=25`. The periodic GC (JEP 346) collects after 30s idle and returns unused heap pages to the OS, so the process shrinks back after the import spike. It has to be a full collection (`-G1PeriodicGCInvokesConcurrent`): the default concurrent cycle left the heap of an idle language server at its peak in our measurements.

Three more flags cut native memory, all measured on commons-lang (249 classes, Java LS RssAnon three minutes after import and build):

- `-XX:TieredStopAtLevel=1` compiles with C1 only. C2's compiler threads and code cache are the largest native cost of an idle language server. JDT LS spends its life in short bursts that C2 never pays back: import and build took 25 instead of 34 CPU seconds, and completion answered in 150-220 ms as before.
- `-XX:+UseCompactObjectHeaders` shrinks every object header (JDK 25, JEP 519).
- `-XX:TrimNativeHeapInterval=30000` returns freed malloc memory to the OS every 30s.

| vmargs | Import + build (CPU s) | Completion (ms) | Java LS after 3 min idle (MiB) |
|---|---|---|---|
| G1, concurrent periodic GC (until 3.0.1) | 34 | 150-270 | 752-757 |
| + full periodic GC, compact headers, trim | 35 | 150-245 | 659 |
| + C1 only (current) | 25 | 150-220 | 286-293 |
| Shenandoah (compact), compact headers, trim | 46 | 155-260 | 310 |

These flags need a JDK 25 runtime. `java-17` runs the language server on the JRE that redhat.java bundles (`plugins/redhat.java/extension/jre`), `java-25` has no bundled JRE and runs it on the image's JDK 25 (`JAVA_HOME`). If an image moves the language server to an older JDK, drop them; `scripts/smoke-test-image.sh` starts that JVM with the configured vmargs to catch a mismatch. SerialGC was deliberately not used here: it only collects when the old generation fills, so a long-lived idle language server would stay pinned at its peak RSS forever. The short-lived Gradle daemon does use SerialGC (smallest footprint); its idle timeout reclaims the memory instead.

## Raising limits for bigger course projects

The defaults target hello-world up to medium single-module projects. For multi-module or framework-heavy courses (e.g. Spring), build a course variant that overrides:

- `-Xmx768m` in `java.jdt.ls.vmargs` (`user-settings.json`); do not go below 512m, JDT LS OOMs on larger projects around 350-450m
- `-Xmx256m` in `org.gradle.jvmargs` (`gradle.properties`); raise to 512m for heavy builds
- `maxHeapSize` in `test-memory.gradle` / `argLine` in the pom if tests need more

## Consciously skipped options

- `org.gradle.daemon=false`: only affects CLI runs, the Tooling API always uses a daemon; it would reintroduce the two-JVM split and add 10-15s to every run. The 2-minute idle timeout is the middle ground.
- `org.gradle.configuration-cache`: marginal RAM benefit, compatibility risk with the Tooling API on Gradle 9.
- `java.server.launchMode: LightWeight`: no classpath-aware completion, no run/debug/test. `Standard` is used instead of the default `Hybrid`, which removes the second (syntax-server) JVM.

## Notes

- `NODE_OPTIONS=--max-old-space-size=512` is inherited by any node a student starts in the terminal. Irrelevant for the Java images; keep in mind if this pattern is copied to a JavaScript image.
- V8 crashes hard when it hits the cap. If plugin-host crashes appear in the field, raise the cap before debugging anything else.
- `MALLOC_ARENA_MAX=2` limits glibc malloc arenas; without it, multi-threaded processes on many-core hosts waste 100-300MB of native RSS on arena fragmentation.

## Measured results (hello-world gradle template, arm64, OrbStack, 2026-08)

Same image, "before" = tuning files removed and env caps unset at runtime. Values are cgroup `memory.current`.

| State | Before | After |
|---|---|---|
| IDE open, Java LS ready, project imported | 2107 MB | 859 MB |
| Right after `./gradlew build` in the terminal | 2514 MB | 1248 MB |
| 3 min idle after the build | 2504 MB | 874 MB |

Process-level, at 3 min idle: before keeps one JDT LS (800 MB) plus **three** Gradle daemons (486+448+433 MB) resident for 3 hours; after keeps one JDT LS (576 MB) and zero daemons. Warm terminal builds take ~0.6s, cold (daemon restart) ~7s.
