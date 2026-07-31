import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { RouterProvider } from "react-router-dom";

import { store } from "./redux/store";
import { router } from "./routes";

import "./styles/global.css";
import ThemeProvider from "./theme/tenants/ThemeProvider";
import QueryProvider from "./providers/QueryProvider";


ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryProvider>
      <Provider store={store}>
        <ThemeProvider >
          <RouterProvider router={router} />
        </ThemeProvider>
      </Provider>
    </QueryProvider>
  </React.StrictMode>
);