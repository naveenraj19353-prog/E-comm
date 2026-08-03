import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { RouterProvider } from "react-router-dom";

import { store } from "./redux/store";
import { router } from "./app/router";
import Providers from "./app/providers";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </Provider>
  </React.StrictMode>
);