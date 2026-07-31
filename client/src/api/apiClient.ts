import axios from "axios";

const apiProxy = axios.create({
  baseURL: "http://127.0.0.1:8000",
  headers: {
    "Content-Type": "application/json",
  },
});

export default apiProxy;

// http://127.0.0.1:8000/product/get-all-products?tenantId=TENANT001