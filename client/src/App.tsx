import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import AuthPage from "@/pages/auth";
import Home from "@/pages/home";
import ChatPage from "@/pages/chat";
import { AppLockProvider } from "@/components/app-lock";

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <Route path="/" component={Home} />
      <Route path="/chat/:userId" component={ChatPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppLockProvider>
          <Toaster />
          <Router />
        </AppLockProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
