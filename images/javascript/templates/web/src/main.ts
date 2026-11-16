const greeting = document.getElementById("greeting")!;
const button = document.getElementById("button")!;
const count = document.getElementById("count")!;

greeting.textContent = "Hello, World!";

let clicks = 0;
button.addEventListener("click", () => {
    clicks++;
    count.textContent = String(clicks);
});
