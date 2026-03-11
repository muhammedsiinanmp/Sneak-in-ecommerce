import React, { useEffect, useState, useContext } from "react";
import { ShopContext } from "../../context/ShopContext";
import { Link } from "react-router-dom";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

const Dashboard = () => {
  const { authFetch } = useContext(ShopContext);
  const [stats, setStats] = useState(null);
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const [dashRes, prodRes] = await Promise.all([
          authFetch(`${API}/admin/dashboard/`),
          authFetch(`${API}/admin/products/?page_size=100`)
        ]);
        if (dashRes?.ok) setStats(await dashRes.json());
        if (prodRes?.ok) {
          const pd = await prodRes.json();
          const all = Array.isArray(pd.results || pd) ? (pd.results || pd) : [];
          setLowStockProducts(all.filter(p => p.stock < 10).sort((a, b) => a.stock - b.stock));
        }
      } catch (err) { console.error("Dashboard load failed:", err); }
      setLoading(false);
    };
    fetchAll();
  }, []);

  const updateOrderStatus = async (id, status) => {
    try {
      const res = await authFetch(`${API}/admin/orders/${id}/`, {
        method: 'PATCH', body: JSON.stringify({ status })
      });
      if (res?.ok) {
        const updated = await res.json();
        setStats(prev => ({
          ...prev,
          recent_orders: prev.recent_orders.map(o => o.id === id ? { ...o, status: updated.status } : o)
        }));
      }
    } catch (err) { console.error(err); }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className="animate-spin w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full mb-4"></div>
        <p className="text-sm text-gray-400">Loading dashboard...</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-32">
        <p className="text-sm text-gray-400">Could not load dashboard data. Please check your connection.</p>
      </div>
    );
  }

  const kpis = [
    { label: "Total Users", value: stats.total_users ?? 0, color: "bg-blue-500", change: null },
    { label: "Total Orders", value: stats.total_orders ?? 0, color: "bg-emerald-500", change: null },
    { label: "Revenue", value: `₹${Number(stats.total_revenue ?? 0).toLocaleString()}`, color: "bg-violet-500", change: null },
    { label: "Pending", value: stats.pending_orders ?? 0, color: "bg-amber-500", change: null },
  ];

  const statusCards = [
    { label: "Delivered", value: stats.delivered_orders ?? 0, color: "text-emerald-600 bg-emerald-50" },
    { label: "Cancelled", value: stats.cancelled_orders ?? 0, color: "text-red-600 bg-red-50" },
    { label: "Low Stock Items", value: stats.low_stock_products ?? 0, color: "text-amber-600 bg-amber-50" },
  ];

  const recentOrders = stats.recent_orders || [];
  const topProducts = stats.top_products || [];

  const statusColors = {
    delivered: "bg-emerald-100 text-emerald-700",
    shipped: "bg-blue-100 text-blue-700",
    cancelled: "bg-red-100 text-red-700",
    pending: "bg-amber-100 text-amber-700",
    confirmed: "bg-gray-100 text-gray-700",
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <p className="text-sm text-gray-500 mt-1">Welcome back, here's what's happening today.</p>
        </div>
        <Link to="/admin/orders" className="text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
          View All Orders →
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-2 h-2 rounded-full ${kpi.color}`}></div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{kpi.label}</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Status Quick Stats */}
      <div className="grid grid-cols-3 gap-4">
        {statusCards.map((s, i) => (
          <div key={i} className={`rounded-xl px-5 py-4 ${s.color}`}>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs font-medium opacity-80 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Orders — 2/3 */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
            <h3 className="text-sm font-semibold text-gray-800">Recent Orders</h3>
            <Link to="/admin/orders" className="text-xs text-gray-500 hover:text-gray-800 font-medium">
              See all →
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {recentOrders.length > 0 ? recentOrders.slice(0, 6).map((order) => (
              <div key={order.id} className="px-5 py-3.5 hover:bg-gray-50/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-600 shrink-0">
                      {order.user_name?.charAt(0)?.toUpperCase() || '#'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800 truncate">{order.user_name || 'Guest'}</p>
                      <p className="text-xs text-gray-400">#{order.id} · {new Date(order.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-3">
                    <span className={`text-[10px] font-semibold uppercase px-2.5 py-1 rounded-full ${statusColors[order.status] || 'bg-gray-100 text-gray-600'}`}>
                      {order.status}
                    </span>
                    <p className="text-sm font-semibold text-gray-900 w-20 text-right">₹{Number(order.total_amount).toLocaleString()}</p>
                  </div>
                </div>
                {/* Quick Status Controls */}
                {order.status !== 'delivered' && order.status !== 'cancelled' && (
                  <div className="flex gap-1.5 mt-2 ml-11">
                    {['confirmed', 'shipped', 'delivered'].filter(s => s !== order.status).map(s => (
                      <button key={s} onClick={() => updateOrderStatus(order.id, s)}
                        className="px-2.5 py-1 text-[10px] font-medium rounded-md border border-gray-200 text-gray-500 hover:bg-gray-900 hover:text-white hover:border-gray-900 transition-all capitalize">
                        → {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )) : (
              <div className="py-12 text-center text-sm text-gray-400">No orders yet</div>
            )}
          </div>
        </div>

        {/* Top Products — 1/3 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800">Top Selling Products</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {topProducts.length > 0 ? topProducts.map((p, i) => (
              <div key={i} className="px-5 py-3.5 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="w-6 h-6 rounded-full bg-gray-900 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                    {i + 1}
                  </span>
                  <p className="text-sm text-gray-700 font-medium truncate">{p.product_name}</p>
                </div>
                <span className="text-sm font-bold text-gray-900 ml-3">{p.total_sold} sold</span>
              </div>
            )) : (
              <div className="py-12 text-center text-sm text-gray-400">No sales data yet</div>
            )}
          </div>
        </div>
      </div>

      {/* Low Stock / Out of Stock Products */}
      {lowStockProducts.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
              <h3 className="text-sm font-semibold text-gray-800">Low Stock & Out of Stock ({lowStockProducts.length})</h3>
            </div>
            <Link to="/admin/products" className="text-xs text-gray-500 hover:text-gray-800 font-medium">
              Manage →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-5 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Product</th>
                  <th className="px-5 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Price</th>
                  <th className="px-5 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Stock</th>
                  <th className="px-5 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lowStockProducts.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50/50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden shrink-0 border border-gray-200">
                          <img src={p.images?.[0]?.image_url || 'https://via.placeholder.com/80'} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                          <p className="text-xs text-gray-400 truncate">{p.brand_name} · {p.category_name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm font-medium text-gray-800">₹{Number(p.price).toLocaleString()}</td>
                    <td className="px-5 py-3">
                      <span className="text-sm font-bold text-gray-900">{p.stock}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-[10px] font-semibold uppercase px-2.5 py-1 rounded-full ${
                        p.stock === 0 ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {p.stock === 0 ? 'Out of Stock' : 'Low Stock'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;