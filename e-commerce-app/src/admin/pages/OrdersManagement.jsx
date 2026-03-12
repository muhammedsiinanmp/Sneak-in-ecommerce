import React, { useEffect, useState, useContext, useCallback } from "react";
import { ShopContext } from "../../context/ShopContext";
import { toast } from "react-toastify";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

const AdminOrders = () => {
  const { authFetch } = useContext(ShopContext);
  const [orders, setOrders] = useState([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [confirmModal, setConfirmModal] = useState({ show: false, id: null, status: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = statusFilter !== "all" ? `&status=${statusFilter}` : "";
      const res = await authFetch(`${API}/admin/orders/?page_size=100${qs}`);
      if (res?.ok) {
        const data = await res.json();
        setOrders(Array.isArray(data.results || data) ? (data.results || data) : []);
      }
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [statusFilter, authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const updateStatus = async (id, status) => {
    try {
      const res = await authFetch(`${API}/admin/orders/${id}/`, {
        method: "PATCH", body: JSON.stringify({ status })
      });

      const data = await res.json();

      if (res?.ok) {
        setOrders(prev => prev.map(o => o.id === id ? data : o));
        if (selectedOrder?.id === id) setSelectedOrder(data);
        toast.success(`Order #${id} updated to ${status}`);
      } else {
        toast.error(data.error || "Failed to update status");
      }
    } catch (err) {
      console.error(err);
      toast.error("An unexpected error occurred");
    } finally {
      setConfirmModal({ show: false, id: null, status: "" });
    }
  };

  const filtered = orders.filter(o => {
    const t = q.toLowerCase();
    return String(o.id).includes(t) || (o.user_email || "").toLowerCase().includes(t) || (o.user_name || "").toLowerCase().includes(t);
  });

  const statusColors = {
    delivered: "bg-emerald-100 text-emerald-700",
    shipped: "bg-blue-100 text-blue-700",
    cancelled: "bg-red-100 text-red-600",
    pending: "bg-amber-100 text-amber-700",
    confirmed: "bg-violet-100 text-violet-700",
  };

  const statusBtns = ["pending", "confirmed", "shipped", "delivered", "cancelled"];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className="animate-spin w-8 h-8 border-2 border-gray-900 border-t-transparent mb-4"></div>
        <p className="text-sm text-gray-400">Loading orders...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Orders</h2>
          <p className="text-sm text-gray-500 mt-1">{orders.length} total orders</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <div className="relative">
            <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by ID or customer..."
              className="w-full sm:w-64 border border-gray-200 px-4 py-2.5 pl-10 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-200 transition-all" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-200 px-4 py-2.5 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-200 appearance-none cursor-pointer">
            <option value="all">All Statuses</option>
            {statusBtns.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Order</th>
                <th className="px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Date</th>
                <th className="px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Customer</th>
                <th className="px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                <th className="px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(o => (
                <tr key={o.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3.5 text-sm font-bold text-gray-900">#{o.id}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-500 hidden sm:table-cell">{new Date(o.created_at).toLocaleDateString()}</td>
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-medium text-gray-800 truncate max-w-[150px]">{o.user_name || 'Guest'}</p>
                    <p className="text-xs text-gray-400 truncate max-w-[150px] hidden md:block">{o.user_email}</p>
                  </td>
                  <td className="px-5 py-3.5 text-sm font-bold text-gray-900">₹{Number(o.total_amount)?.toLocaleString()}</td>
                  <td className="px-5 py-3.5">
                    <span className={`text-[10px] font-semibold uppercase px-2.5 py-1 ${statusColors[o.status] || 'bg-gray-100 text-gray-600'}`}>
                      {o.status || 'pending'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2 flex-wrap">
                        {/* Quick status buttons — only if order can still be updated */}
                        {o.status !== 'delivered' && o.status !== 'cancelled' ? (
                          <select
                            defaultValue=""
                            onChange={(e) => {
                              if (e.target.value) {
                                setConfirmModal({ show: true, id: o.id, status: e.target.value });
                              }
                              e.target.value = "";
                            }}
                            className="text-xs border border-gray-200 px-2 py-1.5 text-gray-500 focus:outline-none focus:border-gray-400 cursor-pointer appearance-none bg-white hover:border-gray-400 transition-colors"
                          >
                            <option value="" disabled>Move to →</option>
                            {statusBtns.filter(s => s !== o.status).map(s => (
                              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-[10px] text-gray-400 font-medium px-2 py-1 bg-gray-50 border border-gray-100 italic">Final State</span>
                        )}
                        <button onClick={() => setSelectedOrder(o)}
                          className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-100 transition-colors">
                          Details
                        </button>
                      </div>
                    </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan="6" className="p-16 text-center text-sm text-gray-400">No orders found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmModal.show && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setConfirmModal({ show: false, id: null, status: "" })} />
          <div className="relative bg-white w-full max-w-sm shadow-2xl z-20 p-6 scale-in-center overflow-hidden">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-12 h-12 bg-amber-50 flex items-center justify-center shrink-0">
                <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
              </div>
              <div>
                <h4 className="text-lg font-bold text-gray-900">Change Status?</h4>
                <p className="text-sm text-gray-500">Update order #{confirmModal.id} to <span className="font-bold text-gray-800 capitalize">{confirmModal.status}</span>?</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmModal({ show: false, id: null, status: "" })}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all font-inter"
              >
                No, Cancel
              </button>
              <button
                onClick={() => updateStatus(confirmModal.id, confirmModal.status)}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-black hover:bg-gray-800 transition-all shadow-lg active:scale-95 font-inter"
              >
                Yes, Change
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelectedOrder(null)} />
          <div className="relative bg-white w-full max-w-3xl shadow-2xl z-10 max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-xl font-bold text-gray-900">Order #{selectedOrder.id}</h4>
                  <span className={`text-[10px] font-semibold uppercase px-2.5 py-1 ${statusColors[selectedOrder.status] || 'bg-gray-100 text-gray-600'}`}>
                    {selectedOrder.status}
                  </span>
                </div>
                <p className="text-xs text-gray-400">{new Date(selectedOrder.created_at).toLocaleString()}</p>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="p-2 hover:bg-gray-100 text-gray-400 hover:text-gray-800">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Customer & Shipping */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Customer</p>
                  <p className="text-sm font-bold text-gray-800">{selectedOrder.user_name || 'Guest'}</p>
                  <p className="text-xs text-gray-500 mt-1">{selectedOrder.user_email}</p>
                </div>
                <div className="bg-gray-50 p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Shipping</p>
                  {selectedOrder.shipping_address ? (
                    <div className="text-sm text-gray-700 space-y-0.5">
                      <p className="font-medium">{selectedOrder.shipping_address.name}</p>
                      <p className="text-xs text-gray-500">{selectedOrder.shipping_address.street}, {selectedOrder.shipping_address.city} {selectedOrder.shipping_address.zipcode}</p>
                    </div>
                  ) : <p className="text-sm text-gray-400 italic">No address</p>}
                </div>
              </div>

              {/* Items */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Items</p>
                <div className="space-y-2">
                  {(selectedOrder.items || []).map((item, idx) => (
                    <div key={idx} className={`flex gap-4 p-3 bg-gray-50 ${item.cancelled ? 'opacity-40' : ''}`}>
                      <div className="w-14 h-14 bg-white overflow-hidden shrink-0 border border-gray-200">
                        <img src={item.product_image || "https://via.placeholder.com/100"} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{item.product_name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Size: {item.size || 'Standard'} · Qty: {item.quantity}
                          {item.cancelled && <span className="text-red-500 font-medium ml-2">Cancelled</span>}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-gray-900 self-center shrink-0">
                        ₹{Number((item.price || 0) * (item.quantity || 1)).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total */}
              <div className="flex justify-between items-center bg-gray-900 text-white px-6 py-5">
                <div>
                  <p className="text-xs text-gray-400">Total Amount</p>
                  <p className="text-xs text-gray-500 mt-0.5">{selectedOrder.payment_method || "Cash on Delivery"}</p>
                </div>
                <p className="text-3xl font-bold">₹{Number(selectedOrder.total_amount).toLocaleString()}</p>
              </div>

              {/* Status Update */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Update Status</p>
                <div className="flex flex-wrap gap-2">
                  {statusBtns.map(st => {
                    const isCurrent = selectedOrder.status === st;
                    const isLocked = selectedOrder.status === "delivered" || selectedOrder.status === "cancelled";
                    return (
                      <button key={st}
                        disabled={isCurrent || isLocked}
                        onClick={() => setConfirmModal({ show: true, id: selectedOrder.id, status: st })}
                        className={`px-4 py-2 text-xs font-semibold border transition-all ${
                          isCurrent
                            ? 'bg-gray-200 text-gray-400 border-gray-200 cursor-default'
                            : isLocked
                              ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                              : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-900 hover:text-white hover:border-gray-900 active:scale-[0.97]'
                        } capitalize`}
                      >
                        {st}
                      </button>
                    );
                  })}
                </div>
                {(selectedOrder.status === "cancelled" || selectedOrder.status === "delivered") && (
                  <p className="text-xs text-amber-600 mt-3 p-3 bg-amber-50 border border-amber-100">
                    Order state is now <strong>{selectedOrder.status}</strong>. Historical records for terminal states cannot be changed.
                  </p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
              <button onClick={() => setSelectedOrder(null)}
                className="px-6 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminOrders;
