const testDiv = document.createElement("div");
testDiv.textContent = "Faceit Veto Helper is alive";
testDiv.style.cssText = `
  position: fixed;
  top: 20px;
  right: 20px;
  background: crimson;
  color: white;
  padding: 12px 16px;
  z-index: 2147483647;
  font-size: 16px;
  border-radius: 6px;
`;
document.body.appendChild(testDiv);

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      console.log(node)
    }
  }
})

observer.observe(document.body, {
  childList: true,
  subtree: true
})