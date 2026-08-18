window.AVM = window.AVM || {};
AVM.modules = AVM.modules || {};

(function () {
  function getBranding() {
    return AVM.utils.storage.readJSON(AVM.CONFIG.STORAGE_KEYS.PARTNER_BRANDING, null);
  }

  function saveBranding(branding) {
    AVM.utils.storage.writeJSON(AVM.CONFIG.STORAGE_KEYS.PARTNER_BRANDING, branding);
  }

  function clearBranding() {
    AVM.utils.storage.writeJSON(AVM.CONFIG.STORAGE_KEYS.PARTNER_BRANDING, null);
  }

  // Reads an uploaded logo file and hands back a data: URL, downscaled to
  // maxDim on its longest side first. A phone photo can easily be 4-8MB —
  // storing that raw in localStorage risks blowing the quota (~5-10MB total
  // for the whole origin) after just one or two partners set up branding on
  // a shared machine. 480px is plenty for a print letterhead logo even at
  // print resolution, and keeps each saved logo to a few hundred KB.
  function readLogoAsDataURL(file, maxDim) {
    maxDim = maxDim || 480;
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error("Couldn't read that file"));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("That doesn't look like a valid image"));
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            const scale = maxDim / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/png"));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // Two-letter fallback avatar text when a partner has a name but no logo
  // uploaded yet — e.g. "Sunrise Diagnostics" -> "SD".
  function initialsFor(name) {
    if (!name) return "";
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  AVM.modules.branding = { getBranding, saveBranding, clearBranding, readLogoAsDataURL, initialsFor };
})();
