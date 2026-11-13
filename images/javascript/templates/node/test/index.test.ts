import assert from "node:assert/strict";
import { test } from "node:test";
import { greet } from "../src/index.js";

test("greet", () => {
    assert.equal(greet("World"), "Hello, World!");
});
