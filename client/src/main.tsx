import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { store } from "./app/store";
import { router } from "./routes/AppRouter";
import ThemeProvider from "./theme/tenants/ThemeProvider";
import ErrorBoundary from "./components/ErrorBoundary/ErrorBoundary";
import PageLoader from "./components/PageLoader";
import AlertProvider from "./components/Modal/AlertProvider";
import { initObservability, rootErrorHandlers } from "./observability";
import "./styles/globals.css";
import "./index.css";

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 1,
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
        },
    },
});

initObservability(store);

ReactDOM.createRoot(document.getElementById("root")!, rootErrorHandlers()).render(<React.StrictMode>
    <ErrorBoundary>
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AlertProvider>
              <Suspense fallback={<PageLoader message="Loading page..." fullViewport />}>
                <RouterProvider router={router}/>
              </Suspense>
            </AlertProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </Provider>
    </ErrorBoundary>
  </React.StrictMode>);
