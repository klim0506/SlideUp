import { useEffect, useState } from "react";

import Dashboard from "@/pages/Dashboard";
import Generating from "@/pages/Generating";
import Home from "@/pages/Home";
import LegalPage from "@/pages/LegalPage";
import Personalization from "@/pages/Personalization";
import PresentationView from "@/pages/PresentationView";
import Usage from "@/pages/Usage";


function getRoute() {
  const publicPresentationMatch = window.location.pathname.match(/^\/p\/([^/]+)\/?$/);
  if (publicPresentationMatch) {
    return { name: "presentation", id: publicPresentationMatch[1], publicView: true };
  }

  const presentationMatch = window.location.pathname.match(
    /^\/presentation\/([^/]+)\/?$/,
  );
  if (presentationMatch) {
    return { name: "presentation", id: presentationMatch[1], publicView: false };
  }
  if (window.location.pathname === "/dashboard") {
    window.history.replaceState({}, "", "/presentation");
    return { name: "presentationList" };
  }
  if (window.location.pathname === "/presentation" || window.location.pathname === "/presentation/") {
    return { name: "presentationList" };
  }
  if (window.location.pathname === "/usage") {
    return { name: "usage" };
  }
  if (window.location.pathname === "/personalization") {
    return { name: "personalization" };
  }
  if (window.location.pathname === "/generating") {
    return { name: "generating" };
  }
  if (window.location.pathname === "/create" || window.location.pathname === "/create/") {
    window.history.replaceState({}, "", "/presentation");
    return { name: "presentationList" };
  }
  if (window.location.pathname.startsWith("/legal/")) {
    return { name: "legal" };
  }
  return { name: "home" };
}

function App() {
  const [route, setRoute] = useState(getRoute);

  useEffect(() => {
    function handleRouteChange() {
      setRoute(getRoute());
    }

    window.addEventListener("popstate", handleRouteChange);
    return () => window.removeEventListener("popstate", handleRouteChange);
  }, []);

  if (route.name === "presentation") {
    return <PresentationView id={route.id} publicView={route.publicView} />;
  }
  if (route.name === "presentationList") {
    return <Dashboard />;
  }
  if (route.name === "usage") {
    return <Usage />;
  }
  if (route.name === "personalization") {
    return <Personalization />;
  }
  if (route.name === "generating") {
    return <Generating />;
  }
  if (route.name === "legal") {
    return <LegalPage />;
  }

  return <Home />;
}

export default App;
