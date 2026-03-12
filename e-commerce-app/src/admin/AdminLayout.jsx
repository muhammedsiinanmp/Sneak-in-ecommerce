import React, { useContext, useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { ShopContext } from '../context/ShopContext';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  Bell,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Store
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

const AdminLayout = ({ children }) => {
  const { logout, user } = useContext(AuthContext);
  const { authFetch } = useContext(ShopContext);
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const menuItems = [
    { path: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/admin/products', label: 'Products', icon: Package },
    { path: '/admin/orders', label: 'Orders', icon: ShoppingCart },
    { path: '/admin/users', label: 'Users', icon: Users },
  ];

  const fetchNotifications = useCallback(async () => {
    try {
      const [listRes, countRes] = await Promise.all([
        authFetch(`${API}/admin/notifications/?limit=10`),
        authFetch(`${API}/admin/notifications/unread-count/`)
      ]);
      if (listRes?.ok) setNotifications(await listRes.json());
      if (countRes?.ok) {
        const data = await countRes.json();
        setUnreadCount(data.unread_count || 0);
      }
    } catch { /* silent */ }
  }, [authFetch]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchNotifications();
    }, 0);
    const interval = setInterval(fetchNotifications, 60000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [fetchNotifications]);

  const markAsRead = async (id) => {
    try {
      await authFetch(`${API}/admin/notifications/${id}/read/`, { method: 'PATCH' });
      fetchNotifications();
    } catch { /* silent */ }
  };

  const markAllRead = async () => {
    try {
      await authFetch(`${API}/admin/notifications/read-all/`, { method: 'PATCH' });
      fetchNotifications();
    } catch { /* silent */ }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const currentPage = menuItems.find(item => item.path === location.pathname)?.label || 'Dashboard';

  return (
    <div className="flex h-screen bg-gray-50">

      {/* ─── Sidebar (Desktop) ─── */}
      <aside className="hidden lg:flex lg:flex-col w-60 bg-white border-r border-gray-200 shrink-0">
        <div className="p-6 pb-4">
          <Link to="/admin/dashboard">
            <img src="/Sneak_logo.png" className="w-36" alt="Sneak-In" />
          </Link>
          <div className="flex items-center gap-2 mt-3">
            <div className="w-6 h-[2px] bg-gray-800"></div>
            <p className="text-[10px] font-semibold tracking-[0.2em] text-gray-500 uppercase">Admin Panel</p>
          </div>
        </div>

        <nav className="flex-1 px-3 mt-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 mb-0.5 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'text-white bg-gray-900 shadow-md'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Icon className="w-[18px] h-[18px]" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-3 px-3 py-2 mb-3">
            <div className="w-9 h-9 bg-gray-900 flex items-center justify-center text-white text-sm font-bold shadow-sm">
              {user?.name?.charAt(0)?.toUpperCase() || 'A'}
            </div>
            <div className="overflow-hidden flex-1">
              <p className="text-sm font-semibold text-gray-800 truncate">{user?.name}</p>
              <p className="text-[10px] text-gray-400 font-medium">Administrator</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-4 py-2.5 text-xs font-semibold text-gray-600 border border-gray-200 hover:bg-gray-900 hover:text-white hover:border-gray-900 transition-all duration-200"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ─── Mobile Sidebar Overlay ─── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-2xl flex flex-col">
            <div className="p-6 flex justify-between items-center border-b border-gray-100">
              <Link to="/admin/dashboard" onClick={() => setSidebarOpen(false)}>
                <img src="/Sneak_logo.png" className="w-28" alt="Logo" />
              </Link>
              <button onClick={() => setSidebarOpen(false)} className="p-2 hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            <nav className="flex-1 px-3 py-4 space-y-1">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3.5 text-sm font-medium transition-all ${
                      isActive ? 'text-white bg-gray-900' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="p-4 border-t border-gray-100">
              <button
                onClick={() => { handleLogout(); setSidebarOpen(false); }}
                className="flex items-center justify-center gap-2 w-full px-4 py-3.5 text-sm font-bold text-white bg-gray-900 active:scale-[0.98] transition-all"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ─── Main Content ─── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top Bar */}
        <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-10 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 hover:bg-gray-100 transition-colors"
            >
              <Menu className="w-5 h-5 text-gray-700" />
            </button>
            <div>
              <h1 className="text-base sm:text-lg font-semibold text-gray-800">{currentPage}</h1>
              <p className="text-[10px] text-gray-400 font-medium hidden sm:block">
                Sneak-In Admin / {currentPage}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative p-2 hover:bg-gray-100 transition-colors"
              >
                <Bell className="w-5 h-5 text-gray-600" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-gray-200 shadow-2xl z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                    <p className="text-sm font-semibold text-gray-800">Notifications</p>
                    {unreadCount > 0 && (
                      <button onClick={markAllRead} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
                    {(Array.isArray(notifications) ? notifications : []).map((n) => (
                      <div
                        key={n.id}
                        onClick={() => markAsRead(n.id)}
                        className={`px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors ${!n.is_read ? 'bg-blue-50/30' : ''}`}
                      >
                        <div className="flex justify-between items-start">
                          <p className="text-sm font-medium text-gray-800 flex-1">{n.title || 'Notification'}</p>
                          <span className="text-[10px] text-gray-400 ml-2 shrink-0">
                            {new Date(n.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{n.message}</p>
                        {!n.is_read && <div className="w-2 h-2 bg-blue-500 mt-2"></div>}
                      </div>
                    ))}
                    {(!notifications || notifications.length === 0) && (
                      <div className="py-10 text-center">
                        <Bell className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                        <p className="text-sm text-gray-400">No notifications yet</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* View Store */}
            <Link
              to="/"
              className="hidden sm:flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-gray-700 border border-gray-200 hover:bg-gray-900 hover:text-white hover:border-gray-900 transition-all duration-200"
            >
              <Store className="w-3.5 h-3.5" />
              View Store
            </Link>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;