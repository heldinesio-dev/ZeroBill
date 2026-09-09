// ================== ESTADO ==================
let products = [];
let invoiceItems = [];

// ================== ELEMENTOS DOM ==================
const availableProducts = document.getElementById("available-products");
const invoiceItemsEl = document.getElementById("invoice-items");
const subtotalEl = document.getElementById("subtotal");
const totalEl = document.getElementById("total");
const paymentReceived = document.getElementById("payment-received");
const changeEl = document.getElementById("change");
const productsSearch = document.getElementById("products-search");
const clientNameInput = document.getElementById("client-name");
const invoiceDate = document.getElementById("invoice-date");
const paymentMethod = document.getElementById("payment-method");

// ================== UTILIDADES ==================
function formatPrice(value) {
  return new Intl.NumberFormat("pt-AO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
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

// ================== CARREGAR TODOS OS DADOS ==================
async function loadData() {
  try {
    // Carrega apenas produtos ativos (recomendado para faturas)
    const loadedProducts = await window.dbAPI.getActiveProducts();
    products = loadedProducts || [];
    renderAvailableProducts();

    // Número da próxima fatura
    const nextNumber = await window.dbAPI.getNextInvoiceNumber();
    document.getElementById("invoice-num").textContent = String(
      nextNumber
    ).padStart(4, "0");

    // Data atual
    invoiceDate.textContent = new Date().toLocaleDateString("pt-PT");

  } catch (err) {
    console.error("Erro ao carregar dados iniciais:", err);
    availableProducts.replaceChildren(
      createTextElement(
        "p",
        "error-message",
        "Erro ao carregar produtos. Verifica se tens produtos ativos no dashboard."
      )
    );
  }
}

// ================== RENDERIZAR PRODUTOS DISPONÍVEIS ==================
function renderAvailableProducts() {
  const query = productsSearch.value.trim().toLowerCase();
  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(query) ||
      (p.description && p.description.toLowerCase().includes(query))
  );

  availableProducts.replaceChildren();
  if (filtered.length === 0) {
    const emptyMessage = createTextElement(
      "p",
      "empty-message",
      "Nenhum produto/serviço encontrado."
    );
    availableProducts.appendChild(emptyMessage);
    return;
  }

  filtered.forEach((p) => {
    const div = document.createElement("div");
    div.className = "product-item";
    const details = document.createElement("div");
    const name = document.createElement("div");
    name.className = "name";
    const nameStrong = document.createElement("strong");
    nameStrong.textContent = p.name;
    name.appendChild(nameStrong);
    details.appendChild(name);
    if (p.description) details.appendChild(createTextElement("div", "desc", p.description));
    div.append(details, createTextElement("div", "price", `${formatPrice(p.price)} Kz`));
    div.addEventListener("click", () => addToInvoice(p));
    availableProducts.appendChild(div);
  });
}

// ================== ADICIONAR ITEM À FATURA ==================
function addToInvoice(product) {
  const existing = invoiceItems.find((i) => i.id === product.id);
  if (existing) {
    existing.qty += 1;
  } else {
    invoiceItems.push({ ...product, qty: 1 });
  }
  renderInvoiceItems();
  updateTotals();
}

// ================== RENDERIZAR ITENS DA FATURA ==================
function renderInvoiceItems() {
  invoiceItemsEl.replaceChildren();
  if (invoiceItems.length === 0) {
    invoiceItemsEl.appendChild(
      createTextElement(
        "p",
        "empty-message",
        "Adicione itens clicando nos produtos à esquerda"
      )
    );
    return;
  }

  invoiceItems.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "invoice-item";
    div.appendChild(createTextElement("div", "item-name", item.name));

    const quantity = document.createElement("input");
    quantity.type = "number";
    quantity.className = "qty";
    quantity.value = item.qty;
    quantity.min = "1";
    div.appendChild(quantity);
    div.appendChild(
      createTextElement("div", "item-total", `${formatPrice(item.price * item.qty)} Kz`)
    );

    const deleteButton = createTextElement("button", "delete-item", "×");
    deleteButton.type = "button";
    div.appendChild(deleteButton);

    quantity.addEventListener("change", (e) => {
      const qty = parseInt(e.target.value, 10);
      if (qty > 0) {
        invoiceItems[index].qty = qty;
      } else {
        invoiceItems.splice(index, 1);
      }
      renderInvoiceItems();
      updateTotals();
    });

    deleteButton.addEventListener("click", () => {
      invoiceItems.splice(index, 1);
      renderInvoiceItems();
      updateTotals();
    });

    invoiceItemsEl.appendChild(div);
  });
}

// ================== ATUALIZAR TOTAIS E TROCO ==================
function updateTotals() {
  const subtotal = invoiceItems.reduce((sum, i) => sum + i.price * i.qty, 0);
  subtotalEl.textContent = `${formatPrice(subtotal)} Kz`;
  totalEl.textContent = `${formatPrice(subtotal)} Kz`;

  const received = parseDecimal(paymentReceived.value) || 0;
  const change = received - subtotal;

  if (change > 0) {
    // Troco positivo → mantém normal
    changeEl.textContent = `${formatPrice(change)} Kz`;
    changeEl.style.color = "var(--accent-success)";
  } else if (change < 0) {
    changeEl.textContent = `🚨 ${formatPrice(Math.abs(change))} Kz em falta`;
    changeEl.style.color = "#ef4444";
    changeEl.style.fontWeight = "bold"; // reforça visualmente
  } else {
    // Exato → neutro
    changeEl.textContent = "Pago exato";
    changeEl.style.color = "var(--text-primary)";
    changeEl.style.fontWeight = "normal";
  }
}

// ================== FINALIZAR FATURA ==================
async function finalizeInvoice() {
  const client = clientNameInput.value.trim();
  const phone = document.getElementById("client-phone").value.trim() || null;

  // Validações essenciais
  if (invoiceItems.length === 0) {
    return alert("Adicione pelo menos um item.");
  }

  if (!client) {
    return alert("Nome do cliente é obrigatório.");
  }

  const subtotal = invoiceItems.reduce((sum, i) => sum + i.price * i.qty, 0);
  const received =
    paymentReceived.value.trim() === ""
      ? subtotal
      : parseDecimal(paymentReceived.value);

  if (!Number.isFinite(received) || received < 0) {
    return alert("Introduz um valor recebido válido.");
  }

  if (received < subtotal) {
    return alert("O valor recebido não pode ser inferior ao total da fatura.");
  }

  const change = received - subtotal;

  const invoiceData = {
    client,
    phone, // ← adicionado aqui (salva null se vazio)
    total: subtotal,
    payment: received,
    change,
    method: paymentMethod?.value || "Dinheiro",
  };

  const items = invoiceItems.map((i) => ({
    id: i.id,
    name: i.name,
    qty: i.qty,
    price: i.price,
  }));

  try {
    const result = await window.dbAPI.saveInvoice(invoiceData, items);

    alert(`Fatura ${result.number} finalizada com sucesso!`);

    // Limpa o formulário
    invoiceItems = [];
    clientNameInput.value = "";
    document.getElementById("client-phone").value = "";
    paymentReceived.value = "";
    renderInvoiceItems();
    updateTotals();

    // Atualiza número da próxima fatura
    const nextNumber = await window.dbAPI.getNextInvoiceNumber();
    document.getElementById("invoice-num").textContent = String(
      nextNumber
    ).padStart(4, "0");
  } catch (err) {
    console.error("Erro ao salvar fatura:", err);
  }
}

// ================== EVENTOS ==================
paymentReceived.addEventListener("input", updateTotals);
productsSearch.addEventListener("input", renderAvailableProducts);

document.getElementById("btn-back").addEventListener("click", () => {
  window.location.href = "../dashboard/index.html";
});

document.getElementById("cancel-invoice").addEventListener("click", () => {
  if (confirm("Cancelar fatura? Todos os itens serão perdidos.")) {
    window.location.href = "../dashboard/index.html";
  }
});

document
  .getElementById("finalize-invoice")
  .addEventListener("click", finalizeInvoice);

// ================== INICIALIZAÇÃO ==================
loadData(); // ← Aqui está a chamada correta (era o erro principal)
