import { createRoot } from "react-dom/client";
import MatchMaps from "./components/MatchMaps/MatchMaps";

console.log("FVH: Faceit Veto Helper content script loaded");

const container = document.createElement("div");
container.id = "faceit-veto-helper-root";
document.body.appendChild(container);

createRoot(container).render(<MatchMaps />);
