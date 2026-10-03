// Must be first: sets the storage read-only guard before "gtss" is
// evaluated, because some of its migrations write at module-init time.
import "./lib/view-mode";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
