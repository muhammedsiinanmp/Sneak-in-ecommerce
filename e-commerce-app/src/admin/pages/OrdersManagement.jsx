import React, { useState, useEffect } from 'react';
import { Clock, Truck, Check, XCircle, Package, Search } from 'lucide-react';
import { toast } from 'react-toastify';

const OrdersManagement = () => {
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    fetchOrders();

    // Listen for order updates from user side
    const handleOrderUpdate = () => {
      fetchOrders();
    };
    window.addEventListener('ordersUpdated', handleOrderUpdate);
    return () => window.removeEventListener('ordersUpdated', handleOrderUpdate);
  }, []);

  useEffect(() => {
    let filtered = orders;

    // Filter by status
    if (filterStatus !== 'all') {
      filtered = filtered.filter(order => {
        const status = order.status || 'processing';
        return status === filterStatus;
      });
    }

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(order =>
        order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.userId?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredOrders(filtered);
  }, [searchQuery, filterStatus, orders]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:3001/orders');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setOrders(data.sort((a, b) => new Date(b.date) - new Date(a.date)));
      setFilteredOrders(data);
    } catch (err) {
      console.error('Error fetching orders:', err);
      toast.error('Failed to load orders');
    }
    setLoading(false);
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    try {
      const order = orders.find(o => o.id === orderId);
      if (!order) return;

      // Check if trying to ship/deliver a cancelled order
      if ((newStatus === 'shipped' || newStatus === 'delivered') && order.status === 'cancelled') {
        toast.error('Cannot change status of a cancelled order');
        return;
      }

      // Check if ALL items are cancelled
      const allItemsCancelled = order.items.every(item => item.cancelled);
      if (allItemsCancelled && (newStatus === 'shipped' || newStatus === 'delivered')) {
        toast.error('Cannot ship or deliver - all items are cancelled');
        return;
      }

      // If changing to cancelled → mark ALL items as cancelled
      let updatedOrder = { status: newStatus };

      if (newStatus === 'cancelled') {
        updatedOrder.items = order.items.map(item => ({
          ...item,
          cancelled: true
        }));
      }

      const res = await fetch(`http://localhost:3001/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedOrder)
      });

      if (!res.ok) throw new Error('Failed to update');

      toast.success(`Order status updated to ${newStatus}`);
      fetchOrders();

      // Notify user side about the update
      window.dispatchEvent(new Event('ordersUpdated'));
    } catch (err) {
      console.error('Error updating order:', err);
      toast.error('Failed to update order status');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'delivered':
        return 'bg-green-100 text-green-700';
      case 'shipped':
        return 'bg-blue-100 text-blue-700';
      case 'cancelled':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-yellow-100 text-yellow-700';
    }
  };

  const statusButtons = [
    { value: 'all', label: 'All Orders', count: orders.length },
    { value: 'processing', label: 'Processing', count: orders.filter(o => !o.status || o.status === 'processing').length },
    { value: 'shipped', label: 'Shipped', count: orders.filter(o => o.status === 'shipped').length },
    { value: 'delivered', label: 'Delivered', count: orders.filter(o => o.status === 'delivered').length },
    { value: 'cancelled', label: 'Cancelled', count: orders.filter(o => o.status === 'cancelled').length }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-lg text-gray-600">Loading orders...</div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Orders Management</h2>
        <p className="text-gray-600 text-sm mt-1">{orders.length} total orders</p>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {statusButtons.map(btn => (
          <button
            key={btn.value}
            onClick={() => setFilterStatus(btn.value)}
            className={`px-4 py-2 rounded-lg font-semibold transition ${filterStatus === btn.value
                ? 'bg-black text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
          >
            {btn.label} ({btn.count})
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by order ID or user ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Orders List */}
      <div className="space-y-4">
        {filteredOrders.map(order => {
          const total = order.items.reduce((sum, item) =>
            sum + (item.cancelled ? 0 : item.price * item.quantity), 0
          );
          const status = order.status || 'processing';

          return (
            <div key={order.id} className="bg-white rounded-xl border shadow-sm hover:shadow-md transition">
              {/* Order Header */}
              <div className="p-6 border-b bg-gray-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-mono text-lg font-bold">Order #{order.id}</h3>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(status)}`}>
                      {status}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>📅 {new Date(order.date).toLocaleString()}</p>
                    <p>👤 User ID: {order.userId || 'Guest'}</p>
                    <p>💳 Payment: {order.paymentMethod.toUpperCase()}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600 mb-1">Order Total</p>
                  <p className="text-3xl font-bold text-gray-800">₹{total.toLocaleString()}</p>
                </div>
              </div>

              {/* Order Items */}
              <div className="p-6">
                <h4 className="font-semibold mb-4 flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Order Items ({order.items.length})
                </h4>
                <div className="space-y-3 mb-6">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="flex gap-4 p-4 bg-gray-50 rounded-lg">
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-20 h-20 object-cover rounded-lg"
                      />
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800">{item.name}</p>
                        <div className="text-sm text-gray-600 mt-1 space-y-1">
                          <p>Size: <span className="font-semibold">{item.size}</span></p>
                          <p>Quantity: <span className="font-semibold">{item.quantity}</span></p>
                          <p>Price: <span className="font-semibold">₹{item.price.toLocaleString()}</span></p>
                        </div>
                        {item.cancelled && (
                          <span className="inline-block mt-2 text-xs font-bold text-red-600 bg-red-100 px-2 py-1 rounded">
                            {order.status === 'cancelled' ? 'CANCELLED' : 'CANCELLED BY USER'}
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-800">
                          ₹{(item.price * item.quantity).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Status Update Buttons */}
                <div className="border-t pt-4">
                  <p className="text-sm font-semibold text-gray-700 mb-3">Update Order Status:</p>
                  {status === 'cancelled' && (
                    <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-700">
                        ⚠️ This order has been cancelled and cannot be changed to shipped or delivered.
                      </p>
                    </div>
                  )}
                  {order.items.every(item => item.cancelled) && status !== 'cancelled' && (
                    <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-sm text-yellow-700">
                        ⚠️ All items in this order are cancelled. Cannot ship or deliver.
                      </p>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => updateOrderStatus(order.id, 'processing')}
                      disabled={status === 'processing'}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition ${status === 'processing'
                          ? 'bg-yellow-500 text-white cursor-default'
                          : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                        }`}
                    >
                      <Clock className="w-4 h-4" />
                      Processing
                    </button>
                    <button
                      onClick={() => updateOrderStatus(order.id, 'shipped')}
                      disabled={status === 'shipped'}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition ${status === 'shipped'
                          ? 'bg-blue-500 text-white cursor-default'
                          : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                        }`}
                    >
                      <Truck className="w-4 h-4" />
                      Shipped
                    </button>
                    <button
                      onClick={() => updateOrderStatus(order.id, 'delivered')}
                      disabled={status === 'delivered'}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition ${status === 'delivered'
                          ? 'bg-green-500 text-white cursor-default'
                          : 'bg-green-100 text-green-700 hover:bg-green-200'
                        }`}
                    >
                      <Check className="w-4 h-4" />
                      Delivered
                    </button>
                    <button
                      onClick={() => updateOrderStatus(order.id, 'cancelled')}
                      disabled={status === 'cancelled'}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition ${status === 'cancelled'
                          ? 'bg-red-500 text-white cursor-default'
                          : 'bg-red-100 text-red-700 hover:bg-red-200'
                        }`}
                    >
                      <XCircle className="w-4 h-4" />
                      Cancelled
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredOrders.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl border">
          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">No orders found</p>
        </div>
      )}
    </div>
  );
};

export default OrdersManagement;