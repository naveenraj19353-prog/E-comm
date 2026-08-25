import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { store } from "./app/store";
import { router } from "./routes/AppRouter";
import ThemeProvider from "./theme/tenants/ThemeProvider";
import "./styles/globals.css";
import "./index.css";
const queryClient = new QueryClient();
console.log(store.getState(), queryClient);
ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode>
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <RouterProvider router={router}/>
        </ThemeProvider>
      </QueryClientProvider>
    </Provider>
  </React.StrictMode>);
