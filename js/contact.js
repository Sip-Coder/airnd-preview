(function () {
  const form = document.getElementById("class-inquiry");
  if (!form) return;
  const status = document.getElementById("inquiry-status");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = window.__airndToken || "";
    if (!token) return;
    if (!form.reportValidity()) return;

    const data = new FormData(form);
    const payload = {
      name: String(data.get("name") || ""),
      phone: String(data.get("phone") || ""),
      email: String(data.get("email") || ""),
      location: String(data.get("location") || ""),
      whatsappVideo: String(data.get("whatsappVideo") || ""),
      hasWhatsapp: String(data.get("hasWhatsapp") || ""),
      inNevada: String(data.get("inNevada") || ""),
      company: String(data.get("company") || ""),
      turnstileToken: token,
    };

    const button = document.getElementById("inquirySubmit");
    if (button) button.disabled = true;
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const type = response.headers.get("content-type") || "";
      if (!type.toLowerCase().includes("application/json")) {
        show("Preview only: this message wasn't sent.");
        form.reset();
        window.__airndToken = "";
        return;
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        show(body.error || "Something went wrong sending your message. Please try again in a moment.");
        if (button) button.disabled = !window.__airndToken;
        return;
      }
      show("Thanks, we'll be in touch within one business day.");
      form.reset();
      window.__airndToken = "";
    } catch {
      show("Something went wrong sending your message. Please try again in a moment.");
      if (button) button.disabled = !window.__airndToken;
    }
  });

  function show(message) {
    if (!status) return;
    status.hidden = false;
    status.textContent = message;
  }
})();
