// dashboard.js - Dashboard ZeroBill

// ======== VARIÁVEIS ========

let products = [];
let companyData = {
  name: "",
  responsible: "", // Nome do responsável (obrigatório)
  nif: "",
  address: "",
  phone: "",
  phoneSecondary: "", // Celular secundário (opcional)
  email: "",
  description: "", // Descrição da empresa (opcional)
};
let editingProductId = null;
let allProductCards = [];
let debounceTimeout = null;
let currentTypeFilter = "all"; // 'all' | 'product' | 'service'
let currentStatusFilter = "all"; // 'all' | 'active' | 'inactive'

// ======== ELEMENTOS DOM ========
const productsGrid = document.getElementById("products-grid");
const globalSearch = document.getElementById("global-search");
const totalItemsEl = document.getElementById("total-items");
const activeItemsEl = document.getElementById("active-items");
const activeValueEl = document.getElementById("active-value");

const companyModalOverlay = document.getElementById("company-modal-overlay");
const companyName = document.getElementById("company-name");
const companyNif = document.getElementById("company-nif");
const companyAddress = document.getElementById("company-address");
const companyPhone = document.getElementById("company-phone");
const companyEmail = document.getElementById("company-email");
const companyCancel = document.getElementById("company-cancel");
const companySave = document.getElementById("company-save");
const btnCompany = document.getElementById("btn-company");

const productModalOverlay = document.getElementById("product-modal-overlay");
const productModalTitle = document.getElementById("product-modal-title");
const typeBtns = document.querySelectorAll(".type-btn");
const productName = document.getElementById("product-name");
const productPrice = document.getElementById("product-price");
const productDescription = document.getElementById("product-description");
const productStatus = document.getElementById("product-status");
const statusText = document.getElementById("status-text");
const productCancel = document.getElementById("product-cancel");
const productSave = document.getElementById("product-save");
const btnNewProduct = document.getElementById("btn-new-product");

if (!window.dbAPI || !window.dbAPI.saveProduct) {
  alert("Erro: dbAPI não carregado corretamente. Verifique preload.js");
}

// ======== UTILIDADES ========
function formatPrice(value) {
  return new Intl.NumberFormat("pt-AO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function getTypeIcon(type) {
  return type === "product" ? "📦" : "🔧";
}

function getStatusText(status) {
  return status === "active" ? "Ativo" : "Inativo";
}

function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
}

function parseDecimal(value) {
  const normalized = value.trim().replace(",", ".");
  return normalized ? Number(normalized) : NaN;
}

// ======== CARREGAR DADOS ========
async function loadData() {
  try {
    products = await window.dbAPI.getAllProducts();
    const company = await window.dbAPI.getCompany();

    renderProducts(products || []); // garante array
    updateSummary(products || []);
    updateCompanyButton();

    // Se usares companyData em algum lugar
    companyData = company;
  } catch (err) {
    console.error("Erro ao carregar dados:", err);
    renderProducts([]);
    updateSummary([]);
  }
}

// ======== RENDER PRODUTOS ========
function renderProducts(items) {
  // Sempre limpa e recria tudo quando a lista muda
  productsGrid.replaceChildren();
  allProductCards = []; // reset total

  if (items.length === 0) {
    const emptyMessage = createTextElement(
      "p",
      "empty-message",
      "Nenhum produto ou serviço encontrado."
    );
    emptyMessage.style.gridColumn = "1 / -1";
    productsGrid.appendChild(emptyMessage);
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("div");
    card.classList.add("product-card");
    card.dataset.id = item.id;
    card.dataset.name = item.name.toLowerCase();
    card.dataset.description = (item.description || "").toLowerCase();
    card.dataset.type = item.type;
    card.dataset.status = item.status; // garante que o novo status é guardado

    const header = document.createElement("div");
    header.className = "product-card-header";
    header.append(
      createTextElement("div", "product-card-type", getTypeIcon(item.type)),
      createTextElement("div", `product-card-status ${item.status}`, getStatusText(item.status))
    );

    const body = document.createElement("div");
    body.className = "product-card-body";
    body.append(
      createTextElement("h3", "product-card-name", item.name),
      createTextElement(
        "p",
        "product-card-description",
        item.description || "Sem descrição"
      )
    );

    const price = createTextElement("div", "product-card-price", formatPrice(item.price));
    const actions = document.createElement("div");
    actions.className = "product-card-actions";
    const editButton = createTextElement("button", "edit-btn", "✏️");
    editButton.type = "button";
    editButton.title = "Editar";
    const deleteButton = createTextElement("button", "delete-btn", "🗑️");
    deleteButton.type = "button";
    deleteButton.title = "Apagar";
    actions.append(editButton, deleteButton);
    card.append(header, body, price, actions);

    // Guarda referência
    allProductCards.push(card);

    // Eventos
    editButton.addEventListener("click", (e) => {
      e.stopPropagation();
      openProductModal("edit", item);
    });

    deleteButton.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteProduct(item.id);
    });

    productsGrid.appendChild(card);
  });
}

// Função de busca com debounce (igual à do management, mas para cards)
function filterProducts(query) {
  clearTimeout(debounceTimeout);
  debounceTimeout = setTimeout(() => {
    const q = query.toLowerCase().trim();
    let visible = 0;

    allProductCards.forEach((card) => {
      const match =
        card.dataset.name.includes(q) || card.dataset.description.includes(q);

      card.style.display = match ? "" : "none";
      if (match) visible++;
    });

    // Mensagem de vazio (podes criar uma div fixa ou usar o p existente)
    let emptyMsg = productsGrid.querySelector(".empty-message");
    if (visible === 0 && q !== "") {
      if (!emptyMsg) {
        emptyMsg = document.createElement("p");
        emptyMsg.className = "empty-message";
        emptyMsg.style.cssText =
          "grid-column:1/-1;text-align:center;color:var(--text-muted);";
        emptyMsg.textContent = "Nenhum produto ou serviço encontrado.";
        productsGrid.appendChild(emptyMsg);
      }
    } else if (emptyMsg) {
      emptyMsg.remove();
    }
  }, 300);
}

// Função principal de filtragem (chamada por todos os filtros + pesquisa)
function applyAllFilters() {
  const q = globalSearch.value.toLowerCase().trim();

  allProductCards.forEach((card) => {
    const nameMatch = card.dataset.name.includes(q);
    const descMatch = card.dataset.description.includes(q);
    const searchMatch = q === "" || nameMatch || descMatch;

    const typeMatch =
      currentTypeFilter === "all" || card.dataset.type === currentTypeFilter;
    const statusMatch =
      currentStatusFilter === "all" ||
      card.dataset.status === currentStatusFilter;

    const visible = searchMatch && typeMatch && statusMatch;
    card.style.display = visible ? "" : "none";
  });

  // Atualiza summary com itens visíveis
  const visibleItems = allProductCards
    .filter((card) => card.style.display !== "none")
    .map((card) => products.find((p) => p.id === parseInt(card.dataset.id))); // recupera dados originais

  updateSummary(visibleItems.filter(Boolean));
}

function updateSummary(items) {
  const total = items.length;
  const active = items.filter((i) => i.status === "active");
  totalItemsEl.textContent = total;
  activeItemsEl.textContent = active.length;
  activeValueEl.textContent = formatPrice(
    active.reduce((sum, i) => sum + i.price, 0)
  );
}

// ======== PESQUISA ========
function handleSearch() {
  const query = globalSearch.value.trim().toLowerCase();
  const filtered = products.filter(
    (item) =>
      item.name.toLowerCase().includes(query) ||
      (item.description && item.description.toLowerCase().includes(query))
  );
  renderProducts(filtered);
  updateSummary(filtered);
}

// ======== MODAL EMPRESA ========
function updateCompanyButton() {
  btnCompany.textContent = "Empresa";
}

function openCompanyModal() {
  // Preenche todos os campos com os valores atuais de companyData
  companyName.value = companyData.name || "";
  document.getElementById("company-responsible").value =
    companyData.responsible || "";
  companyNif.value = companyData.nif || "";
  companyAddress.value = companyData.address || "";
  companyPhone.value = companyData.phone || "";
  document.getElementById("company-phone-secondary").value =
    companyData.phoneSecondary || "";
  companyEmail.value = companyData.email || "";
  document.getElementById("company-description").value =
    companyData.description || "";

  companyModalOverlay.classList.add("active");
}

function closeCompanyModal() {
  companyModalOverlay.classList.remove("active");
}

function saveCompanyData() {
  companyData = {
    name: companyName.value.trim(),
    responsible: document.getElementById("company-responsible").value.trim(),
    nif: companyNif.value.trim(),
    address: companyAddress.value.trim(),
    phone: companyPhone.value.trim(),
    phoneSecondary: document
      .getElementById("company-phone-secondary")
      .value.trim(),
    email: companyEmail.value.trim(),
    description: document.getElementById("company-description").value.trim(),
  };

  // Validação mínima
  if (!companyData.name || !companyData.responsible) {
    alert("Por favor, preencha o Nome da Empresa e o Nome do Responsável.");
    return;
  }

  window.dbAPI.saveCompany(companyData);
  updateCompanyButton();
  alert("Dados da empresa guardados com sucesso!");
  closeCompanyModal();
}

// ======== MODAL PRODUTO ========
function openProductModal(mode = "new", item = null) {
  editingProductId = mode === "edit" ? item.id : null;
  productModalTitle.textContent =
    mode === "new" ? "Novo Produto/Serviço" : "Editar Produto/Serviço";

  typeBtns.forEach((btn) => btn.classList.remove("active"));
  const type = item?.type || "product";
  document
    .querySelector(`.type-btn[data-type="${type}"]`)
    ?.classList.add("active");

  productName.value = item?.name || "";
  productPrice.value = item?.price || "";
  productDescription.value = item?.description || "";
  productStatus.checked = item?.status !== "inactive";
  updateStatusText();

  productModalOverlay.classList.add("active");
}

function closeProductModal() {
  productModalOverlay.classList.remove("active");
  editingProductId = null;
}

async function saveProduct() {
  const productData = {
    id: editingProductId || undefined,
    name: productName.value.trim(),
    type: document.querySelector(".type-btn.active")?.dataset.type || "product",
    description: productDescription.value.trim(),
    price: parseDecimal(productPrice.value),
    status: productStatus.checked ? "active" : "inactive",
  };

  if (!productData.name || isNaN(productData.price) || productData.price < 0) {
    alert("Por favor, preenche nome e preço válido.");
    return;
  }

  try {
    // Salva e espera confirmação
    await window.dbAPI.saveProduct(productData);

    // Recarrega a lista completa (com await)
    const updatedProducts = await window.dbAPI.getAllProducts();

    renderProducts(updatedProducts || []);
    updateSummary(updatedProducts || []);

    closeProductModal();
    alert("Produto/Serviço guardado com sucesso!");
  } catch (err) {
    console.error("Erro ao salvar produto:", err);
    alert("Erro ao salvar produto. Verifique o console (DevTools).");
  }

}

function updateStatusText() {
  statusText.textContent = productStatus.checked
    ? "Ativo e visível"
    : "Inativo";
}

async function deleteProduct(id) {
  // ← torna async
  if (!confirm("Tens certeza que queres apagar este item?")) return;

  await window.dbAPI.deleteProduct(id); // ← await aqui
  products = await window.dbAPI.getAllProducts(); // ← await aqui também!
  renderProducts(products);
  updateSummary(products);
}

// ======== EVENT LISTENERS ========
globalSearch.addEventListener("input", () => {
  clearTimeout(debounceTimeout);
  debounceTimeout = setTimeout(applyAllFilters, 300);
});

document.getElementById("btn-management")?.addEventListener("click", () => {
  window.location.href = "../management/management.html";
});

document.getElementById("btn-new-invoice")?.addEventListener("click", () => {
  window.location.href = "../invoice/invoice.html";
});

btnCompany.addEventListener("click", openCompanyModal);
companyCancel.addEventListener("click", closeCompanyModal);
companySave.addEventListener("click", saveCompanyData);
companyModalOverlay.addEventListener("click", (e) => {
  if (e.target === companyModalOverlay) closeCompanyModal();
});

document.getElementById("filter-type").addEventListener("change", (e) => {
  currentTypeFilter = e.target.value;
  applyAllFilters();
});

document.getElementById("filter-status").addEventListener("change", (e) => {
  currentStatusFilter = e.target.value;
  applyAllFilters();
});

btnNewProduct.addEventListener("click", () => openProductModal("new"));

typeBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    typeBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

productStatus.addEventListener("change", updateStatusText);

productCancel.addEventListener("click", closeProductModal);
productSave.addEventListener("click", async () => {
  await saveProduct();
});
productModalOverlay.addEventListener("click", (e) => {
  if (e.target === productModalOverlay) closeProductModal();
});

updateCompanyButton();

// ======== INICIALIZAÇÃO ========
loadData();
