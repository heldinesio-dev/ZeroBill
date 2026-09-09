// main.js
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const Store = require("electron-store");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");
const { globalShortcut } = require("electron");

// ← MOVEU PARA AQUI: declara o store ANTES de usar
const store = new Store();

// Configuração mínima do auto-updater
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = "info";

// Carrega dados persistentes (agora store já existe)
let products = store.get("products", []);
let companyData = store.get("companyData", {
  name: "",
  responsible: "",
  nif: "",
  address: "",
  phone: "",
  phoneSecondary: "",
  email: "",
  description: "",
});
let invoices = store.get("invoices", []);

const paymentMethods = new Set(["Dinheiro", "Transferência", "Express"]);

function parseNumericValue(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return NaN;
  const normalized = value.trim().replace(",", ".");
  return normalized ? Number(normalized) : NaN;
}

function requireObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldName} inválido.`);
  }
}

function requireString(
  value,
  fieldName,
  { required = true, maxLength = 200 } = {},
) {
  if (value === undefined || value === null) {
    if (!required) return "";
    throw new Error(`${fieldName} é obrigatório.`);
  }

  if (typeof value !== "string" || value.trim().length > maxLength) {
    throw new Error(`${fieldName} inválido.`);
  }

  const normalized = value.trim();
  if (required && !normalized) throw new Error(`${fieldName} é obrigatório.`);
  return normalized;
}

function validateProduct(product) {
  requireObject(product, "Produto");
  const name = requireString(product.name, "Nome do produto", {
    maxLength: 200,
  });
  const description = requireString(product.description, "Descrição", {
    required: false,
    maxLength: 1000,
  });
  const price = parseNumericValue(product.price);

  if (!Number.isFinite(price) || price < 0)
    throw new Error("Preço do produto inválido.");
  if (!["product", "service"].includes(product.type)) {
    throw new Error("Tipo de produto inválido.");
  }
  if (!["active", "inactive"].includes(product.status)) {
    throw new Error("Estado do produto inválido.");
  }

  if (
    product.id !== undefined &&
    (!Number.isSafeInteger(product.id) || product.id <= 0)
  ) {
    throw new Error("ID do produto inválido.");
  }

  return {
    id: product.id,
    name,
    type: product.type,
    description,
    price,
    status: product.status,
  };
}

function validateCompany(data) {
  requireObject(data, "Dados da empresa");
  return {
    name: requireString(data.name, "Nome da empresa", { maxLength: 200 }),
    responsible: requireString(data.responsible, "Responsável", {
      maxLength: 200,
    }),
    nif: requireString(data.nif, "NIF", { required: false, maxLength: 50 }),
    address: requireString(data.address, "Morada", {
      required: false,
      maxLength: 300,
    }),
    phone: requireString(data.phone, "Telefone", {
      required: false,
      maxLength: 50,
    }),
    phoneSecondary: requireString(data.phoneSecondary, "Telefone secundário", {
      required: false,
      maxLength: 50,
    }),
    email: requireString(data.email, "Email", {
      required: false,
      maxLength: 254,
    }),
    description: requireString(data.description, "Descrição", {
      required: false,
      maxLength: 1000,
    }),
  };
}

function validateInvoice(invoice, items) {
  requireObject(invoice, "Fatura");
  if (!Array.isArray(items) || items.length === 0)
    throw new Error("Itens da fatura inválidos.");

  const validatedItems = items.map((item) => {
    requireObject(item, "Item da fatura");
    const id = Number(item.id);
    const name = requireString(item.name, "Nome do item", { maxLength: 200 });
    const qty = parseNumericValue(item.qty);
    const price = parseNumericValue(item.price);

    if (!Number.isSafeInteger(id) || id <= 0)
      throw new Error("ID do item inválido.");
    if (!Number.isSafeInteger(qty) || qty <= 0)
      throw new Error("Quantidade do item inválida.");
    if (!Number.isFinite(price) || price < 0)
      throw new Error("Preço do item inválido.");

    return { id, name, qty, price };
  });

  const total = validatedItems.reduce(
    (sum, item) => sum + item.price * item.qty,
    0,
  );
  const payment =
    invoice.payment === undefined ? total : parseNumericValue(invoice.payment);
  const method = invoice.method || "Dinheiro";
  const client = requireString(invoice.client, "Cliente", { maxLength: 200 });
  const phone = requireString(invoice.phone, "Telefone", {
    required: false,
    maxLength: 50,
  });

  if (!Number.isFinite(total) || !Number.isFinite(payment) || payment < total) {
    throw new Error("Pagamento inválido ou inferior ao total da fatura.");
  }
  if (!paymentMethods.has(method))
    throw new Error("Método de pagamento inválido.");

  return {
    client,
    phone,
    total,
    payment,
    change: payment - total,
    method,
    items: validatedItems,
  };
}

// IPC Handlers
ipcMain.handle("db-save-product", (event, product) => {
  const validatedProduct = validateProduct(product);
  if (validatedProduct.id) {
    products = products.map((p) =>
      p.id === validatedProduct.id ? validatedProduct : p,
    );
  } else {
    validatedProduct.id = Date.now();
    products.push(validatedProduct);
  }
  store.set("products", products); // ← persistir
  return validatedProduct;
});
ipcMain.handle("db-delete-product", (event, id) => {
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new Error("ID do produto inválido.");
  products = products.filter((p) => p.id !== id);
  store.set("products", products); // ← persistir
});
ipcMain.handle("db-save-company", (event, data) => {
  companyData = validateCompany(data);
  store.set("companyData", companyData); // ← persistir
});
ipcMain.handle("db-save-invoice", (event, invoice, items) => {
  const validatedInvoice = validateInvoice(invoice, items);

  const newInvoice = {
    id: Date.now(),
    number: invoices.length + 1,
    date: new Date().toISOString(),
    ...validatedInvoice,
  };
  invoices.push(newInvoice);
  store.set("invoices", invoices);
  return { number: newInvoice.number };
});
ipcMain.handle("db-get-next-invoice-number", () => invoices.length + 1);
ipcMain.handle("db-get-products", () => {
  return products; // devolve todos os produtos
});
ipcMain.handle("db-get-active-products", () => {
  return products.filter((p) => p.status === "active");
});
ipcMain.handle("db-get-company", () => {
  return companyData; // devolve os dados da empresa
});
// Handler para faturas por período
ipcMain.handle("db-get-invoices-by-period", (event, period) => {
  const now = new Date();
  let startDate = new Date(now);
  let endDate = new Date(now);
  switch (period) {
    case "daily":
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999); // Inclui todo o dia atual
      break;
    case "weekly":
      startDate.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // Segunda-feira
      startDate.setHours(0, 0, 0, 0);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
      break;
    case "monthly":
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );
      break;
    case "yearly":
      startDate.setFullYear(now.getFullYear(), 0, 1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setFullYear(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      break;
    default:
      return [];
  }
  return invoices.filter((inv) => {
    const invDate = new Date(inv.date);
    return invDate >= startDate && invDate <= endDate;
  });
});
// Handler para reset (agora fora, único e correto)
ipcMain.handle("db-reset-all-data", () => {
  invoices = [];
  products = [];
  companyData = { name: "", nif: "", address: "", phone: "", email: "" };
  store.set("invoices", []);
  store.set("products", []);
  store.set("companyData", companyData);
  return { success: true };
});

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    backgroundColor: "#0f1115",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  mainWindow.setFullScreen(true);
  mainWindow.loadFile(
    path.join(__dirname, "..", "renderer", "dashboard", "index.html"),
  );

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("closed", () => app.quit());
}

// Registra o atalho Ctrl+Q / Cmd+Q e inicia tudo
app.whenReady().then(() => {
  // Registra o shortcut e guarda o resultado
  const ret = globalShortcut.register("CommandOrControl+Shift+Q", () => {
    app.quit();
  });

  if (!ret) {
    console.error("Falha ao registrar CommandOrControl+Shift+Q");
  }

  // Inicia auto-update
  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on("update-downloaded", () => {
    log.info("Atualização baixada – reiniciando em 5 segundos...");
    setTimeout(() => autoUpdater.quitAndInstall(), 5000);
  });

  // Cria a janela principal – agora vai executar
  createWindow();
});

// Para Mac: reabre janela se clicar no ícone do Dock
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Fecha o app quando todas janelas fechadas (exceto Mac)
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Limpa atalhos ao fechar (boa prática, evita memory leak)
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
