import DesktopApp from "./DesktopApp";
import { ConfirmProvider } from "./ui/confirm";

// We used to gate narrow viewports behind a "Mobile Version Pending…"
// placeholder, but the individual surfaces (MonitoringPanel, AddNodePanel,
// ProfileSelectPage, modals) are responsive now — so the gate just hid a
// usable UI behind a useless screen. DesktopApp renders unconditionally;
// child components still read viewport-width via their own hooks where
// they need to change layout. Truly mobile-target builds (iOS/Android)
// would need a separate fork of DesktopApp anyway because of titlebar
// chrome and window APIs, not a CSS toggle.
function App() {
  return (
    <ConfirmProvider>
      <DesktopApp />
    </ConfirmProvider>
  );
}

export default App;
