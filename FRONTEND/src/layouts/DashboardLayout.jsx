import { Outlet } from "react-router-dom";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import AlertToast from "../components/AlertToast";

export default function DashboardLayout() {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-area">
        <Navbar />
        <main className="content">
          <Outlet />
        </main>
      </div>

      {/* Real-Time Global Alert Toast Notification */}
      <AlertToast />
    </div>
  );
}
