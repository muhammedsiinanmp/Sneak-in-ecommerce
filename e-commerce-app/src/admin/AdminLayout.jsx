import React, { useContext, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  Users, 
  BarChart3, 
  LogOut, 
  Menu, 
  X 
} from 'lucide-react';

const AdminLayout = ({ children }) => {
  const { logout, user } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const menuItems = [
    { path: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/admin/products', label: 'Products', icon: Package },
    { path: '/admin/orders', label: 'Orders', icon: ShoppingCart },
    { path: '/admin/users', label: 'Users', icon: Users },
  ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-gray-50">
      
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex lg:flex-col w-64 bg-gray-900 text-white">
        <div className="p-6">
          <Link to="/admin/dashboard" className="flex items-center gap-2">
            <img src="/Sneak_logo.png" className="w-32 rounded" alt="Logo" />
          </Link>
          <p className="text-sm text-gray-400 mt-2">Admin Panel</p>
        </div>

        <nav className="flex-1 px-4 space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center gap-3 px-4 py-3 mb-2">
            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
              <span className="text-white font-semibold">
                {user?.name?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold">{user?.name}</p>
              <p className="text-xs text-gray-400">Administrator</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 rounded-lg transition"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-gray-900 text-white">
            <div className="p-6 flex justify-between items-center">
              <Link to="/admin/dashboard" onClick={() => setSidebarOpen(false)}>
                <img src="/Sneak_logo.png" className="w-32 rounded" alt="Logo" />
              </Link>
              <button onClick={() => setSidebarOpen(false)}>
                <X className="w-6 h-6" />
              </button>
            </div>

            <nav className="px-4 space-y-2">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-800">
              <button
                onClick={() => {
                  handleLogout();
                  setSidebarOpen(false);
                }}
                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 rounded-lg transition"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="bg-white border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-gray-100"
            >
              <Menu className="w-6 h-6" />
            </button>
            
            <h1 className="text-xl font-bold text-gray-800">
              {menuItems.find(item => item.path === location.pathname)?.label || 'Dashboard'}
            </h1>

            <div className="flex items-center gap-2">
              <Link
                to="/"
                className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition"
              >
                View Store
              </Link>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;