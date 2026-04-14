/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productSearch = document.getElementById("productSearch");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");
const sendButton = document.getElementById("sendBtn");
const generateRoutineButton = document.getElementById("generateRoutine");
const productModal = document.getElementById("productModal");
const productModalTitle = document.getElementById("productModalTitle");
const productModalBrand = document.getElementById("productModalBrand");
const productModalImage = document.getElementById("productModalImage");
const productModalDescription = document.getElementById(
  "productModalDescription",
);

function applyDocumentDirectionFromLanguage() {
  const rtlLanguageCodes = ["ar", "fa", "he", "ur"];
  const currentLanguage = (document.documentElement.lang || "").toLowerCase();
  const isRtlLanguage = rtlLanguageCodes.some(
    (code) =>
      currentLanguage === code || currentLanguage.startsWith(`${code}-`),
  );

  document.documentElement.setAttribute("dir", isRtlLanguage ? "rtl" : "ltr");
}

applyDocumentDirectionFromLanguage();

let allProducts = [];
const selectedProducts = new Map();
const conversationHistory = [];
let latestRoutine = "";
const OPENAI_API_URL = "https://openai-api-key.charleslee49ers.workers.dev/";
const SELECTED_PRODUCTS_STORAGE_KEY = "selectedProductIds";
const WEB_ENABLED_MODEL = "gpt-4o-search-preview";
const FALLBACK_MODEL = "gpt-4o";

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

/* Load product data from JSON file */
async function loadProducts() {
  if (allProducts.length > 0) {
    return allProducts;
  }

  const response = await fetch("products.json");
  const data = await response.json();
  allProducts = data.products;

  return allProducts;
}

function getSelectedProducts() {
  return Array.from(selectedProducts.values());
}

function saveSelectedProductsToStorage() {
  const selectedIds = Array.from(selectedProducts.keys());
  localStorage.setItem(
    SELECTED_PRODUCTS_STORAGE_KEY,
    JSON.stringify(selectedIds),
  );
}

function getSavedSelectedProductIds() {
  const rawValue = localStorage.getItem(SELECTED_PRODUCTS_STORAGE_KEY);

  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(rawValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);
  } catch (error) {
    return [];
  }
}

function restoreSelectedProductsFromStorage() {
  const savedIds = getSavedSelectedProductIds();

  if (savedIds.length === 0) {
    return;
  }

  savedIds.forEach((savedId) => {
    const matchedProduct = allProducts.find(
      (product) => product.id === savedId,
    );

    if (matchedProduct) {
      selectedProducts.set(savedId, matchedProduct);
    }
  });
}

function getSelectedProductsForApi() {
  return getSelectedProducts().map((product) => ({
    name: product.name,
    brand: product.brand,
    category: product.category,
    description: product.description,
  }));
}

function getAvailableBrandsForApi() {
  const uniqueBrands = Array.from(new Set(allProducts.map((p) => p.brand)));
  return uniqueBrands.sort();
}

function renderChatMessage(role, message) {
  const messageElement = document.createElement("div");
  messageElement.className = `chat-message ${
    role === "user" ? "chat-message--user" : "chat-message--assistant"
  }`;
  messageElement.textContent = message;

  chatWindow.appendChild(messageElement);

  const targetScrollTop = messageElement.offsetTop - chatWindow.offsetTop;
  chatWindow.scrollTo({
    top: Math.max(targetScrollTop, 0),
    behavior: "smooth",
  });
}

function renderAssistantMessage(message) {
  renderChatMessage("assistant", message);
}

function renderUserMessage(message) {
  renderChatMessage("user", message);
}

function resetConversationHistory() {
  conversationHistory.length = 0;
}

function addMessageToConversation(role, content) {
  conversationHistory.push({ role, content });
}

function clearChatWindow() {
  chatWindow.innerHTML = "";
}

function renderRoutinePendingPlaceholder() {
  if (latestRoutine || chatWindow.childElementCount > 0) {
    return;
  }

  chatWindow.innerHTML = `
    <p class="chat-window-placeholder">
      Your personalized routine will be generated here after you click Generate Routine.
    </p>
  `;
}

function setChatControlsDisabled(disabled) {
  userInput.disabled = disabled;
  sendButton.disabled = disabled;
  generateRoutineButton.disabled = disabled;
}

function renderLoadingState() {
  renderAssistantMessage(
    "Generating your routine from the selected products...",
  );
}

function getOpenAIApiKey() {
  return (
    window.OPENAI_API_KEY ||
    window.openaiApiKey ||
    window.API_KEY ||
    window.apiKey ||
    ""
  );
}

function isValidWorkerEndpoint(url) {
  return /^https:\/\/.+workers\.dev\/?$/i.test(url);
}

function getAssistantTextFromApiData(data) {
  if (!data || !Array.isArray(data.choices) || data.choices.length === 0) {
    return "";
  }

  const content = data.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const combinedText = content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (part?.type === "text") {
          return part?.text || "";
        }

        return "";
      })
      .join("\n")
      .trim();

    return combinedText;
  }

  return "";
}

function buildChatRequestPayload(messages, temperature, model, useWebSearch) {
  const payload = {
    model,
    messages,
    temperature,
  };

  if (useWebSearch) {
    // If supported by the worker/backend, this enables live web lookups.
    payload.web_search_options = {};
  }

  return payload;
}

async function generateRoutine() {
  const selectedProductsForApi = getSelectedProductsForApi();

  if (selectedProductsForApi.length === 0) {
    renderAssistantMessage(
      "Select at least one product before generating a routine.",
    );
    return;
  }

  const apiKey = getOpenAIApiKey();

  clearChatWindow();
  renderLoadingState();

  const messages = [
    {
      role: "system",
      content:
        "You are a beauty routine assistant focused on L'Oreal portfolio products and routines (including owned brands such as CeraVe, La Roche-Posay, Vichy, Kiehl's, Maybelline, Lancome, Garnier, Kerastase, and SkinCeuticals). Create a concise, personalized routine using only the selected products provided by the user. Do not add products that are not in the selected list. Organize the routine into morning, evening, and optional notes if useful. Keep the language clear and beginner-friendly.",
    },
    {
      role: "user",
      content: `Create a personalized routine using only these selected products:\n${JSON.stringify(
        selectedProductsForApi,
        null,
        2,
      )}`,
    },
  ];

  setChatControlsDisabled(true);

  try {
    const routine = await requestAssistantResponse(messages, apiKey, 0.7);

    if (!routine) {
      renderAssistantMessage("No routine was returned by the API.");
      return;
    }

    clearChatWindow();
    renderAssistantMessage(routine);

    latestRoutine = routine;
    resetConversationHistory();
    addMessageToConversation("assistant", routine);
  } catch (error) {
    renderAssistantMessage(
      "Something went wrong while generating the routine.",
    );
  } finally {
    setChatControlsDisabled(false);
  }
}

async function requestAssistantResponse(messages, apiKey, temperature = 0.6) {
  if (!isValidWorkerEndpoint(OPENAI_API_URL)) {
    throw new Error("Invalid Worker endpoint configuration.");
  }

  const headers = {
    "Content-Type": "application/json",
  };

  // Keep optional Authorization support in case the worker expects it.
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const attemptConfigs = [
    {
      model: WEB_ENABLED_MODEL,
      useWebSearch: true,
    },
    {
      model: FALLBACK_MODEL,
      useWebSearch: false,
    },
  ];

  let lastErrorMessage = "Unable to generate a response right now.";

  for (const attempt of attemptConfigs) {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(
        buildChatRequestPayload(
          messages,
          temperature,
          attempt.model,
          attempt.useWebSearch,
        ),
      ),
    });

    const contentType = response.headers.get("content-type") || "";
    const isJsonResponse = contentType.includes("application/json");

    let data;
    let responseText = "";

    if (isJsonResponse) {
      data = await response.json();
    } else {
      responseText = await response.text();
    }

    if (!response.ok) {
      lastErrorMessage =
        data?.error?.message ||
        responseText ||
        "Unable to generate a response right now.";

      // If the web-enabled attempt fails, try the plain fallback model.
      if (attempt.useWebSearch) {
        continue;
      }

      throw new Error(lastErrorMessage);
    }

    const assistantText = getAssistantTextFromApiData(data);

    if (!assistantText) {
      lastErrorMessage = "Worker returned an invalid response format.";

      if (attempt.useWebSearch) {
        continue;
      }

      throw new Error(lastErrorMessage);
    }

    return assistantText;
  }

  throw new Error(lastErrorMessage);
}

async function handleFollowUpQuestion(userQuestion) {
  if (!latestRoutine) {
    renderAssistantMessage(
      "Generate your routine first, then ask follow-up questions in the chat.",
    );
    return;
  }

  const apiKey = getOpenAIApiKey();
  const knownLorealBrands = getAvailableBrandsForApi();

  // We include the selected products and latest generated routine so the
  // assistant can answer follow-ups with consistent context.
  const routineContextMessage = {
    role: "system",
    content: `Known L'Oreal portfolio brands for this app:\n${JSON.stringify(
      knownLorealBrands,
      null,
      2,
    )}\n\nSelected products:\n${JSON.stringify(
      getSelectedProductsForApi(),
      null,
      2,
    )}\n\nCurrent generated routine:\n${latestRoutine}`,
  };

  const followUpMessages = [
    {
      role: "system",
      content:
        "You are a product advisor for a routine-builder app. Answer follow-up questions using the routine context and prior chat history. You may discuss L'Oreal portfolio products and routines (including owned brands such as CeraVe). Do not recommend, compare, or discuss products outside the L'Oreal portfolio. If the user asks about unrelated topics or non-L'Oreal products, politely refuse and ask them to keep the chat focused on L'Oreal products and routines. Prioritize the user's selected products and generated routine when giving guidance. When current web information is available, include source links or citations at the end under a 'Sources' heading.",
    },
    routineContextMessage,
    ...conversationHistory,
    { role: "user", content: userQuestion },
  ];

  setChatControlsDisabled(true);

  try {
    const assistantReply = await requestAssistantResponse(
      followUpMessages,
      apiKey,
      0.6,
    );

    if (!assistantReply) {
      renderAssistantMessage("No response was returned by the API.");
      return;
    }

    addMessageToConversation("user", userQuestion);
    addMessageToConversation("assistant", assistantReply);
    renderAssistantMessage(assistantReply);
  } catch (error) {
    renderAssistantMessage(
      error.message || "Something went wrong while answering your question.",
    );
  } finally {
    setChatControlsDisabled(false);
  }
}

function toggleProductSelection(productId) {
  const product = allProducts.find((item) => item.id === productId);

  if (!product) {
    return;
  }

  if (selectedProducts.has(productId)) {
    selectedProducts.delete(productId);
  } else {
    selectedProducts.set(productId, product);
  }

  saveSelectedProductsToStorage();
  renderSelectedProducts();
  renderVisibleProducts();
}

function clearAllSelectedProducts() {
  selectedProducts.clear();
  saveSelectedProductsToStorage();
  renderSelectedProducts();
  renderVisibleProducts();
}

function renderSelectedProducts() {
  const selectedItems = getSelectedProducts();

  if (selectedItems.length === 0) {
    selectedProductsList.innerHTML = "";
    return;
  }

  selectedProductsList.innerHTML = selectedItems
    .map(
      (product) => `
        <div class="selected-product-item" data-product-id="${product.id}">
          <img
            class="selected-product-item__image"
            src="${product.image}"
            alt="${product.name}"
            loading="lazy"
          />
          <div class="selected-product-item__details">
            <span class="selected-product-item__brand">${product.brand}</span>
            <span class="selected-product-item__name">${product.name}</span>
          </div>
          <button
            type="button"
            class="selected-product-remove"
            data-product-id="${product.id}"
            aria-label="Remove ${product.name}"
          >
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      `,
    )
    .join("");

  selectedProductsList.insertAdjacentHTML(
    "beforeend",
    `
      <div class="selected-products-actions">
        <button type="button" class="selected-products-clear" data-clear-selected>
          Clear all selected products
        </button>
      </div>
    `,
  );
}

function openProductModal(productId) {
  const product = allProducts.find((item) => item.id === productId);

  if (!product) {
    return;
  }

  productModalBrand.textContent = product.brand;
  productModalTitle.textContent = product.name;
  productModalImage.src = product.image;
  productModalImage.alt = product.name;
  productModalDescription.textContent = product.description;

  productModal.hidden = false;
  productModal.setAttribute("aria-hidden", "false");

  document.body.classList.add("modal-open");
}

function closeProductModal() {
  productModal.hidden = true;
  productModal.setAttribute("aria-hidden", "true");

  document.body.classList.remove("modal-open");
}

function doesProductMatchSearch(product, searchTerm) {
  if (!searchTerm) {
    return true;
  }

  const searchableText =
    `${product.name} ${product.brand} ${product.category} ${product.description}`.toLowerCase();
  return searchableText.includes(searchTerm);
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  if (products.length === 0) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        No matching products found. Try another search term or category.
      </div>
    `;

    return;
  }

  productsContainer.innerHTML = products
    .map((product) => {
      const isSelected = selectedProducts.has(product.id);

      return `
        <div
          class="product-card ${isSelected ? "is-selected" : ""}"
          data-product-id="${product.id}"
          role="button"
          tabindex="0"
          aria-pressed="${isSelected ? "true" : "false"}"
          aria-label="${isSelected ? "Unselect" : "Select"} ${product.name} by ${product.brand}"
        >
          <img src="${product.image}" alt="${product.name}">
          <div class="product-info">
            <h3>${product.name}</h3>
            <p>${product.brand}</p>
          </div>
          <button
            type="button"
            class="product-card__details"
            data-product-details="${product.id}"
          >
            View details
          </button>
        </div>
      `;
    })
    .join("");
}

async function renderVisibleProducts() {
  const products = await loadProducts();
  const selectedCategory = categoryFilter.value;
  const searchTerm = productSearch.value.trim().toLowerCase();

  if (!selectedCategory && !searchTerm) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        Select a category or start typing in search to view products
      </div>
    `;

    return;
  }

  const filteredProducts = products.filter((product) => {
    const matchesCategory =
      !selectedCategory ||
      selectedCategory === "all" ||
      product.category === selectedCategory;
    const matchesSearch = doesProductMatchSearch(product, searchTerm);

    return matchesCategory && matchesSearch;
  });

  displayProducts(filteredProducts);
}

/* Filter and display products when category changes */
categoryFilter.addEventListener("change", async (e) => {
  if (!e.target.value) {
    renderVisibleProducts();
    return;
  }

  await renderVisibleProducts();
});

productSearch.addEventListener("input", () => {
  renderVisibleProducts();
});

productsContainer.addEventListener("click", (event) => {
  const detailsButton = event.target.closest("[data-product-details]");

  if (detailsButton) {
    event.stopPropagation();
    openProductModal(Number(detailsButton.dataset.productDetails));
    return;
  }

  const card = event.target.closest(".product-card");

  if (!card) {
    return;
  }

  toggleProductSelection(Number(card.dataset.productId));
});

productsContainer.addEventListener("keydown", (event) => {
  if (event.target.closest("[data-product-details]")) {
    return;
  }

  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  const card = event.target.closest(".product-card");

  if (!card) {
    return;
  }

  event.preventDefault();
  toggleProductSelection(Number(card.dataset.productId));
});

selectedProductsList.addEventListener("click", (event) => {
  const clearButton = event.target.closest("[data-clear-selected]");

  if (clearButton) {
    clearAllSelectedProducts();
    return;
  }

  const removeButton = event.target.closest(".selected-product-remove");

  if (!removeButton) {
    return;
  }

  toggleProductSelection(Number(removeButton.dataset.productId));
});

generateRoutineButton.addEventListener("click", async () => {
  await generateRoutine();
});

productModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-modal-close]")) {
    closeProductModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !productModal.hidden) {
    closeProductModal();
  }
});

loadProducts().then(() => {
  restoreSelectedProductsFromStorage();
  renderSelectedProducts();
});

renderRoutinePendingPlaceholder();

/* Chat form submission handler - placeholder for OpenAI integration */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const question = userInput.value.trim();

  if (!question) {
    return;
  }

  renderUserMessage(question);
  userInput.value = "";

  await handleFollowUpQuestion(question);
});
