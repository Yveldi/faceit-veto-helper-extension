const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (
      mutation.type === 'attributes' &&
      mutation.attributeName === 'data-state' &&
      mutation.target.getAttribute('role') === 'dialog' &&
      mutation.target.getAttribute('data-dialog-type') === 'MODAL' &&
      mutation.target.textContent.includes('Match ready') &&
      mutation.target.getAttribute('data-state') === 'open'
    ) {
      console.log('Match ready!', mutation.target)
    }
  }
})

observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['data-state']
})