import { useState, useEffect } from "react";
import DesktopApp from "./DesktopApp";

function App() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return isMobile ? <div>Mobile Version Pending...</div> : <DesktopApp />;
}

export default App;