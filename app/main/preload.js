// preload.js
const { contextBridge, ipcRenderer } = require("electron");

const dbAPI = {
  getAllProducts: () => ipcRenderer.invoke("db-get-products"),
  getActiveProducts: () => ipcRenderer.invoke("db-get-active-products"),
  saveProduct: (product) => ipcRenderer.invoke("db-save-product", product),
  deleteProduct: (id) => ipcRenderer.invoke("db-delete-product", id),
  getInvoicesByPeriod: (period) =>
    ipcRenderer.invoke("db-get-invoices-by-period", period),

  getCompany: () => ipcRenderer.invoke("db-get-company"),
  saveCompany: (data) => ipcRenderer.invoke("db-save-company", data),

  saveInvoice: (invoice, items) =>
    ipcRenderer.invoke("db-save-invoice", invoice, items),
  getNextInvoiceNumber: () => ipcRenderer.invoke("db-get-next-invoice-number"),
  resetAllData: () => ipcRenderer.invoke("db-reset-all-data"),
};

contextBridge.exposeInMainWorld("dbAPI", dbAPI);
