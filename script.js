/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const generateRoutineButton = document.getElementById("generateRoutine");
const productModal = document.getElementById("productModal");
const productModalTitle = document.getElementById("productModalTitle");
const productModalBrand = document.getElementById("productModalBrand");
const productModalImage = document.getElementById("productModalImage");
const productModalDescription = document.getElementById(
  "productModalDescription",
);

let allProducts = [];
const selectedProducts = new Map();
const OPENAI_API_URL = "https://openai-api-key.charleslee49ers.workers.dev/";

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

function getSelectedProductsForApi() {
  return getSelectedProducts().map((product) => ({
    name: product.name,
    brand: product.brand,
    category: product.category,
    description: product.description,
  }));
}

function renderChatMessage(html) {
  chatWindow.innerHTML = "";

  const messageElement = document.createElement("div");
  messageElement.className = "chat-message chat-message--assistant";
  messageElement.textContent = html;

  chatWindow.appendChild(messageElement);
}

function renderChatText(message) {
  renderChatMessage(message);
}

function renderLoadingState() {
  renderChatText("Generating your routine from the selected products...");
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

async function generateRoutine() {
  const selectedProductsForApi = getSelectedProductsForApi();

  if (selectedProductsForApi.length === 0) {
    renderChatText("Select at least one product before generating a routine.");
    return;
  }

  const apiKey = getOpenAIApiKey();

  renderLoadingState();

  const messages = [
    {
      role: "system",
      content:
        "You are a helpful beauty routine assistant. Create a concise, personalized routine using only the selected products provided by the user. Organize the routine into morning, evening, and optional notes if useful. Keep the language clear and beginner-friendly.",
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

  try {
    const headers = {
      "Content-Type": "application/json",
    };

    // Keep optional Authorization support in case the worker expects it.
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "gpt-4o",
        messages,
        temperature: 0.7,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMessage =
        data?.error?.message || "Unable to generate the routine right now.";
      renderChatText(errorMessage);
      return;
    }

    const routine = data?.choices?.[0]?.message?.content;

    if (!routine) {
      renderChatText("No routine was returned by the API.");
      return;
    }

    renderChatText(routine);
  } catch (error) {
    renderChatText("Something went wrong while generating the routine.");
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

  renderSelectedProducts();
  renderVisibleProducts();
}

function renderSelectedProducts() {
  const selectedItems = getSelectedProducts();

  selectedProductsList.innerHTML = selectedItems
    .map(
      (product) => `
        <div class="selected-product-item" data-product-id="${product.id}">
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

/* Create HTML for displaying product cards */
function displayProducts(products) {
  if (products.length === 0) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        No products found for this category.
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

  if (!selectedCategory) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        Select a category to view products
      </div>
    `;

    return;
  }

  const filteredProducts = products.filter(
    (product) => product.category === selectedCategory,
  );

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

/* Chat form submission handler - placeholder for OpenAI integration */
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();

  renderChatText(
    "Use Generate Routine to create a personalized routine from your selected products.",
  );
});
