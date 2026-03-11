import React, { useState, useEffect, useContext } from 'react';
import { ShopContext } from "../../context/ShopContext";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

const UsersManagement = () => {
  const { authFetch } = useContext(ShopContext);
  const [users, setUsers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, ordersRes] = await Promise.all([
        authFetch(`${API}/admin/users/?page_size=100`),
        authFetch(`${API}/admin/orders/?page_size=100`)
      ]);
      const ud = usersRes?.ok ? await usersRes.json() : {};
      const od = ordersRes?.ok ? await ordersRes.json() : {};
      setUsers(Array.isArray(ud.results || ud) ? (ud.results || ud) : []);
      setOrders(Array.isArray(od.results || od) ? (od.results || od) : []);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const toggleUserBlock = async (userId) => {
    setActionLoading(userId);
    try {
      const res = await authFetch(`${API}/admin/users/${userId}/block/`, { method: 'PATCH' });
      if (res?.ok) {
        const result = await res.json();
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: result.is_active } : u));
        if (selectedUser?.id === userId) setSelectedUser(prev => ({ ...prev, is_active: result.is_active }));
      }
    } catch (err) { console.error(err); }
    setActionLoading(null);
  };

  const getUserOrders = (uid) => orders.filter(o => String(o.user) === String(uid));
  const getUserSpent = (uid) => getUserOrders(uid).reduce((s, o) => s + (Number(o.total_amount) || 0), 0);

  const filtered = users.filter(u =>
    u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalActive = users.filter(u => u.is_active !== false).length;
  const totalBlocked = users.filter(u => u.is_active === false).length;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className="animate-spin w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full mb-4"></div>
        <p className="text-sm text-gray-400">Loading users...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Users</h2>
          <p className="text-sm text-gray-500 mt-1">{users.length} total registered users</p>
        </div>
        <div className="relative w-full sm:w-72">
          <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          <input
            type="text" placeholder="Search by name or email..."
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-4 py-2.5 pl-10 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-200 transition-all"
          />
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Total</p>
          <p className="text-2xl font-bold text-gray-900">{users.length}</p>
        </div>
        <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-5">
          <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider mb-1">Active</p>
          <p className="text-2xl font-bold text-emerald-700">{totalActive}</p>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-100 p-5">
          <p className="text-xs font-medium text-red-500 uppercase tracking-wider mb-1">Blocked</p>
          <p className="text-2xl font-bold text-red-600">{totalBlocked}</p>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">User</th>
                <th className="px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Email</th>
                <th className="px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Orders</th>
                <th className="px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Spent</th>
                <th className="px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(u => {
                const oc = getUserOrders(u.id).length;
                const sp = getUserSpent(u.id);
                const active = u.is_active !== false;
                return (
                  <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {u.name?.charAt(0)?.toUpperCase() || 'U'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{u.name}</p>
                          <p className="text-xs text-gray-400 md:hidden truncate">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-500 hidden md:table-cell">{u.email}</td>
                    <td className="px-5 py-3.5">
                      <span className={`text-[10px] font-semibold uppercase px-2.5 py-1 rounded-full ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                        {active ? 'Active' : 'Blocked'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm font-medium text-gray-800 hidden sm:table-cell">{oc}</td>
                    <td className="px-5 py-3.5 text-sm font-medium text-gray-800 hidden lg:table-cell">₹{sp.toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setSelectedUser(u)}
                          className="px-3 py-1.5 text-xs font-medium text-gray-600 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors">
                          View
                        </button>
                        <button
                          disabled={actionLoading === u.id}
                          onClick={() => toggleUserBlock(u.id)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                            active
                              ? 'text-red-600 border-red-200 hover:bg-red-600 hover:text-white hover:border-red-600'
                              : 'text-emerald-600 border-emerald-200 hover:bg-emerald-600 hover:text-white hover:border-emerald-600'
                          } ${actionLoading === u.id ? 'opacity-50 cursor-wait' : ''}`}
                        >
                          {active ? 'Block' : 'Unblock'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-16 text-center text-sm text-gray-400">No users match your search</div>
          )}
        </div>
      </div>

      {/* User Detail Panel */}
      {selectedUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelectedUser(null)} />
          <div className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl z-10 max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-start">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gray-900 flex items-center justify-center text-white text-lg font-bold">
                  {selectedUser.name?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{selectedUser.name}</h3>
                  <p className="text-xs text-gray-400">{selectedUser.email}</p>
                </div>
              </div>
              <button onClick={() => setSelectedUser(null)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-800">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs text-gray-400 mb-1">Total Orders</p>
                  <p className="text-2xl font-bold text-gray-900">{getUserOrders(selectedUser.id).length}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs text-gray-400 mb-1">Total Spent</p>
                  <p className="text-2xl font-bold text-gray-900">₹{getUserSpent(selectedUser.id).toLocaleString()}</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Recent Orders</p>
                <div className="space-y-2">
                  {getUserOrders(selectedUser.id).slice(-5).reverse().map(o => (
                    <div key={o.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-800">Order #{o.id}</p>
                        <p className="text-xs text-gray-400">{new Date(o.created_at).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-900">₹{Number(o.total_amount).toLocaleString()}</p>
                        <span className={`text-[10px] font-semibold uppercase ${
                          o.status === 'delivered' ? 'text-emerald-600' : o.status === 'cancelled' ? 'text-red-500' : 'text-gray-500'
                        }`}>{o.status}</span>
                      </div>
                    </div>
                  ))}
                  {getUserOrders(selectedUser.id).length === 0 && (
                    <p className="text-center text-xs text-gray-400 py-6">No orders yet</p>
                  )}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => setSelectedUser(null)}
                className="flex-1 py-3 text-sm font-medium text-gray-600 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                Close
              </button>
              <button
                onClick={() => { toggleUserBlock(selectedUser.id); }}
                className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all ${
                  selectedUser.is_active !== false
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                {selectedUser.is_active !== false ? 'Block User' : 'Unblock User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersManagement;