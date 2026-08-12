window.AVM = window.AVM || {};

AVM.CONFIG = {
  APP_NAME: "AVM Labs Rate List",
  COMPANY_NAME: "AVMLabs",
  CURRENCY_SYMBOL: "₹",
  CURRENCY_LOCALE: "en-IN",

  DEFAULT_PAGE_SIZE: 25,
  AVAILABLE_PAGE_SIZES: [25, 50, 100],

  // No backend exists yet — everything reads from js/data.js. This is the seam:
  // swap AVM.data's internals for fetch(`${API_BASE_URL}/...`) calls later without
  // touching any module that consumes AVM.data's functions.
  API_BASE_URL: "",

  // Placeholders carried over from the original rate card — not real contact details.
  CONTACT_EMAIL: "care@avmlabs.example",
  CONTACT_PHONE: "+91 00000 00000",

  PRICE_BANDS: [
    { id: "under-200", label: "Under ₹200", max: 199 },
    { id: "200-500", label: "₹200 – ₹500", min: 200, max: 500 },
    { id: "500-1000", label: "₹500 – ₹1,000", min: 501, max: 1000 },
    { id: "above-1000", label: "Above ₹1,000", min: 1001 },
  ],

  STORAGE_KEYS: {
    PROFILE: "avm_profile",
    SAVED_PROFILES: "avm_saved_profiles",
    PRINT_PAYLOAD: "avm_print_payload_v1",
    PREFERENCES: "avm_preferences",
  },
};
