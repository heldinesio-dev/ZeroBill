// management.js - Gestão Financeira
// Declarações (só IDs, sem listeners ainda)
const btnBack = document.getElementById("btn-back");
const periodBtns = document.querySelectorAll(".period-btn");
const managementSearch = document.getElementById("management-search");
const totalSales = document.getElementById("total-sales");
const invoiceCount = document.getElementById("invoice-count");
const topProduct = document.getElementById("top-product");
const salesTableBody = document.querySelector("#sales-table tbody");
const detailOverlay = document.getElementById("invoice-detail-overlay");
const detailInvoiceNum = document.getElementById("detail-invoice-num");
const detailClient = document.getElementById("detail-client");
const detailDatetime = document.getElementById("detail-datetime");
const detailTotal = document.getElementById("detail-total");
const detailPayment = document.getElementById("detail-payment");
const detailChange = document.getElementById("detail-change");
const detailItems = document.getElementById("detail-items");
const detailClose = document.getElementById("detail-close");

let currentPeriod = "daily";
let currentInvoices = [];
let chartInstance = null; // Para gráfico

function formatPrice(value) {
  return (
    new Intl.NumberFormat("pt-AO", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value || 0) + " Kz"
  );
}

function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
}

function showLoading(show) {
  salesTableBody.replaceChildren();
  if (show) {
    const row = document.createElement("tr");
    const cell = createTextElement("td", "", "Carregando...");
    cell.colSpan = 5;
    cell.style.textAlign = "center";
    cell.style.padding = "2rem";
    row.appendChild(cell);
    salesTableBody.appendChild(row);
  }
}

async function loadPeriodData(period) {
  currentPeriod = period;
  showLoading(true);
  try {
    currentInvoices = await window.dbAPI.getInvoicesByPeriod(period);
    renderSalesTable(currentInvoices);
    updateSummary(currentInvoices);
    renderChart(currentInvoices);
  } catch (err) {
    console.error("Erro ao carregar faturas:", err);
    salesTableBody.replaceChildren();
    const row = document.createElement("tr");
    const cell = createTextElement("td", "error-message", "Erro ao carregar dados.");
    cell.colSpan = 5;
    cell.style.textAlign = "center";
    row.appendChild(cell);
    salesTableBody.appendChild(row);
  }
  managementSearch.value = "";
  filterSales("");
}

function updateSummary(invoices) {
  const total = invoices.reduce((sum, inv) => sum + inv.total, 0);
  totalSales.textContent = formatPrice(total);
  invoiceCount.textContent = invoices.length;
  const productCount = {};
  invoices.forEach((inv) => {
    inv.items.forEach((i) => {
      productCount[i.name] = (productCount[i.name] || 0) + i.qty;
    });
  });
  const top = Object.entries(productCount).sort((a, b) => b[1] - a[1])[0];
  topProduct.textContent = top ? `${top[0]} (${top[1]})` : "-";
}

function renderSalesTable(invoices) {
  salesTableBody.replaceChildren();
  if (invoices.length === 0) {
    const row = document.createElement("tr");
    row.className = "empty";
    const cell = createTextElement(
      "td",
      "",
      "Nenhuma venda registrada neste período."
    );
    cell.colSpan = 5;
    row.appendChild(cell);
    salesTableBody.appendChild(row);
    return;
  }
  invoices.forEach((inv) => {
    const row = document.createElement("tr");
    row.style.cursor = "pointer";
    row.append(
      createTextElement("td", "", new Date(inv.date).toLocaleDateString("pt-PT")),
      createTextElement("td", "", inv.number),
      createTextElement("td", "", inv.client),
      createTextElement("td", "", inv.items.length),
      createTextElement("td", "", formatPrice(inv.total))
    );
    row.addEventListener("click", () => openInvoiceDetail(inv));
    salesTableBody.appendChild(row);
  });
}

detailClose.addEventListener("click", () => {
  detailOverlay.classList.remove("active");
});

function openInvoiceDetail(inv) {
  detailInvoiceNum.textContent = inv.number;
  detailClient.textContent = inv.client;
  detailDatetime.textContent = new Date(inv.date).toLocaleString("pt-PT");
  detailTotal.textContent = formatPrice(inv.total);
  detailPayment.textContent = formatPrice(inv.payment || inv.total);
  detailChange.textContent = formatPrice(inv.change || 0);
  detailItems.replaceChildren();
  inv.items.forEach((item) => {
    const tr = document.createElement("tr");
    tr.append(
      createTextElement("td", "", item.name),
      createTextElement("td", "", item.qty),
      createTextElement("td", "", formatPrice(item.price)),
      createTextElement("td", "", formatPrice(item.price * item.qty))
    );
    detailItems.appendChild(tr);
  });
  detailOverlay.classList.add("active");
}

let debounceTimeout;
function filterSales(query) {
  clearTimeout(debounceTimeout);
  debounceTimeout = setTimeout(() => {
    const rows = salesTableBody.querySelectorAll("tr:not(.empty)");
    let visible = 0;
    rows.forEach((row) => {
      row.style.display = row.textContent
        .toLowerCase()
        .includes(query.toLowerCase())
        ? ""
        : "none";
      if (row.style.display !== "none") visible++;
    });
    let emptyRow = salesTableBody.querySelector(".empty");
    if (visible === 0 && query !== "") {
      if (!emptyRow) {
        emptyRow = document.createElement("tr");
        emptyRow.className = "empty";
        const cell = createTextElement("td", "", "Nenhum resultado encontrado.");
        cell.colSpan = 5;
        emptyRow.appendChild(cell);
        salesTableBody.appendChild(emptyRow);
      }
    } else if (emptyRow) {
      emptyRow.remove();
    }
  }, 300);
}

function renderChart(invoices) {
  const ctx = document.getElementById("sales-chart");
  if (!ctx) return;
  if (chartInstance) chartInstance.destroy();
  const productSales = {};
  invoices.forEach((inv) => {
    inv.items.forEach((i) => {
      if (!productSales[i.name])
        productSales[i.name] = {
          qty: 0,
          total: 0,
          isService: i.type === "service",
        };
      productSales[i.name].qty += i.qty;
      productSales[i.name].total += i.price * i.qty;
    });
  });
  const labels = Object.keys(productSales);
  const qtyData = labels.map((name) => productSales[name].qty);
  const totalData = labels.map((name) => productSales[name].total);
  chartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Quantidade Vendida",
          data: qtyData,
          backgroundColor: "hsl(210, 75%, 55%)",
        },
        {
          label: "Total Faturado (Kz)",
          data: totalData,
          backgroundColor: "hsl(152, 70%, 45%)",
          yAxisID: "y1",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: "Quantidade", font: { size: 12 } },
        },
        y1: {
          position: "right",
          beginAtZero: true,
          title: { display: true, text: "Total (Kz)", font: { size: 12 } },
        },
      },
      plugins: {
        legend: { position: "top", labels: { font: { size: 12 } } },
      },
    },
  });
}

// Tudo protegido: listeners só depois do DOM estar pronto
window.addEventListener("DOMContentLoaded", () => {
  // Event listeners
  btnBack.addEventListener("click", () => {
    window.location.href = "../dashboard/index.html";
  });

  periodBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      periodBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      loadPeriodData(btn.dataset.period);
    });
  });

  managementSearch.addEventListener("input", (e) =>
    filterSales(e.target.value.trim())
  );

  detailOverlay.addEventListener("click", (e) => {
    if (e.target === detailOverlay) detailOverlay.classList.remove("active");
  });

  // Botão Limpar Todos os Dados - com verificação dupla
  document.getElementById("reset-data").addEventListener("click", async () => {
    // Confirmação 1
    const firstConfirm = confirm(
      "TEM CERTEZA ABSOLUTA?\n\nIsto vai apagar:\n- Todos os produtos\n- Todas as faturas\n- Dados da empresa\n\nEsta ação é IRREVERSÍVEL."
    );

    if (!firstConfirm) return;

    // Confirmação 2 (reforçada)
    const secondConfirm = confirm(
      "ÚLTIMO AVISO!\n\nClique em OK para APAGAR DEFINITIVAMENTE todos os dados.\n\nCancelar para abortar."
    );

    if (!secondConfirm) return;

    try {
      await window.dbAPI.resetAllData();

      alert("Todos os dados foram apagados com sucesso.");

      // Recarrega a página para refletir os dados zerados
      window.location.reload();
    } catch (err) {
      console.error("Erro ao limpar dados:", err);
      alert("Erro ao limpar os dados.");
    }
  });

  // Carrega dados iniciais
  loadPeriodData("daily");
});
