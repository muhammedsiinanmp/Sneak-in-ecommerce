import React, { useState, useEffect } from 'react';
import { Search, Mail, ShoppingBag, User, Trash2, X, Package, Clock, IndianRupee, Calendar } from 'lucide-react';

const API = "http://localhost:3001";

const UsersManagement = () => {
  const [users, setUsers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    totalRevenue: 0,
    avgOrderValue: 0
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, ordersRes] = await Promise.all([
        fetch(`${API}/users`),
        fetch(`${API}/orders`)
      ]);

      const usersData = usersRes.ok ? await usersRes.json() : [];
      const ordersData = ordersRes.ok ? await ordersRes.json() : [];

      const validUsers = Array.isArray(usersData) ? usersData : [];
      const validOrders = Array.isArray(ordersData) ? ordersData : [];

      setUsers(validUsers);
      setOrders(validOrders);

      // Calculate statistics
      calculateStats(validUsers, validOrders);
    } catch (err) {
      console.error('Error fetching data:', err);
    }
    setLoading(false);
  };

  const calculateStats = (users, orders) => {
    const totalUsers = users.length;
    const activeUsers = users.filter(u => u.status !== 'inactive').length;
    
    const totalRevenue = orders.reduce((sum, order) => {
      const orderTotal = (order.items || []).reduce((itemSum, item) =>
        itemSum + (item.price || 0) * (item.quantity || 0), 0
      );
      return sum + orderTotal;
    }, 0);

    const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;

    setStats({
      totalUsers,
      activeUsers,
      totalRevenue,
      avgOrderValue: avgOrderValue.toFixed(2)
    });
  };

  const getUserOrders = (userId) => {
    return orders.filter(order => order.userId === userId || order.userId?.toString() === userId.toString());
  };

  const getUserTotalSpent = (userId) => {
    return getUserOrders(userId).reduce((sum, order) => {
      const orderTotal = (order.items || []).reduce((itemSum, item) =>
        itemSum + (item.price || 0) * (item.quantity || 0), 0
      );
      return sum + orderTotal;
    }, 0);
  };

  const getUserTotalOrders = (userId) => {
    return getUserOrders(userId).length;
  };

  const handleDeleteUser = async (userId, userName) => {
    if (!window.confirm(`Are you sure you want to delete user "${userName}"? This will also delete all their orders.`)) {
      return;
    }

    try {
      // First, delete all user's orders
      const userOrders = getUserOrders(userId);
      for (const order of userOrders) {
        await fetch(`${API}/orders/${order.id}`, {
          method: 'DELETE',
        });
      }

      // Then delete the user
      const response = await fetch(`${API}/users/${userId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setUsers(users.filter(u => u.id !== userId));
        if (selectedUser?.id === userId) {
          setSelectedUser(null);
        }
        alert('User deleted successfully');
        fetchData(); // Refresh data
      }
    } catch (err) {
      console.error('Error deleting user:', err);
      alert('Failed to delete user');
    }
  };

  const filteredUsers = users.filter(user =>
    user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.id?.toString().includes(searchQuery)
  );

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', { 
      day: 'numeric',
      month: 'short', 
      year: 'numeric' 
    });
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Users Management</h2>
        <p className="text-gray-600 mt-1">Manage registered users and their activities</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-5 border shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Total Users</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalUsers}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <User className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Active Users</p>
              <p className="text-2xl font-bold text-gray-900">{stats.activeUsers}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <User className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Total Revenue</p>
              <p className="text-2xl font-bold text-gray-900">₹{stats.totalRevenue.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-lg">
              <IndianRupee className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Avg Order Value</p>
              <p className="text-2xl font-bold text-gray-900">₹{stats.avgOrderValue}</p>
            </div>
            <div className="p-3 bg-orange-100 rounded-lg">
              <Package className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search users by name, email, or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">User</th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">Email</th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">Orders</th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">Total Spent</th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredUsers.map(user => {
                const totalOrders = getUserTotalOrders(user.id);
                const totalSpent = getUserTotalSpent(user.id);

                return (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0">
                          {getInitials(user.name)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{user.name}</p>
                          <p className="text-xs text-gray-500">ID: {user.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2 text-gray-600">
                        <Mail className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate max-w-[200px]">{user.email}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <ShoppingBag className="w-4 h-4 text-blue-500" />
                        <span className="font-medium">{totalOrders}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <IndianRupee className="w-4 h-4 text-green-500" />
                        <span className="font-semibold text-green-600">
                          ₹{totalSpent.toFixed(2)}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedUser(user)}
                          className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition shadow-sm"
                        >
                          View Details
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id, user.name)}
                          className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition"
                          title="Delete User"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredUsers.length === 0 && (
          <div className="text-center py-12">
            <User className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">No users found</p>
            <p className="text-gray-400 text-sm mt-1">Try a different search term</p>
          </div>
        )}

        <div className="px-6 py-4 border-t bg-gray-50">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Showing <span className="font-semibold">{filteredUsers.length}</span> of{' '}
              <span className="font-semibold">{users.length}</span> users
            </div>
          </div>
        </div>
      </div>

      {/* User Details Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center z-10">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                  {getInitials(selectedUser.name)}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selectedUser.name}</h2>
                  <p className="text-gray-600 text-sm">User Details</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="text-gray-500 hover:text-gray-700 p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6">
              {/* User Info */}
              <div className="mb-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600 mb-1">User ID</p>
                    <p className="font-mono font-semibold text-gray-900">#{selectedUser.id}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600 mb-1">Email</p>
                    <p className="font-medium text-gray-900 truncate">{selectedUser.email}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar className="w-4 h-4 text-gray-500" />
                      <p className="text-sm text-gray-600">Joined Date</p>
                    </div>
                    <p className="font-medium text-gray-900">{formatDate(selectedUser.createdAt)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-blue-50 rounded-lg p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-blue-600 mb-1">Total Orders</p>
                        <p className="text-3xl font-bold text-gray-900">
                          {getUserTotalOrders(selectedUser.id)}
                        </p>
                      </div>
                      <ShoppingBag className="w-10 h-10 text-blue-500 opacity-70" />
                    </div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-green-600 mb-1">Total Spent</p>
                        <p className="text-3xl font-bold text-gray-900">
                          ₹{getUserTotalSpent(selectedUser.id).toFixed(2)}
                        </p>
                      </div>
                      <IndianRupee className="w-10 h-10 text-green-500 opacity-70" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Order History */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Order History
                </h3>
                
                {getUserOrders(selectedUser.id).length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 rounded-lg">
                    <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No orders placed yet</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {getUserOrders(selectedUser.id).map(order => {
                      const total = (order.items || []).reduce((sum, item) =>
                        sum + (item.price || 0) * (item.quantity || 0), 0
                      );
                      
                      return (
                        <div key={order.id} className="border rounded-lg p-4 hover:bg-gray-50 transition">
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <p className="font-medium text-gray-900">Order #{order.id}</p>
                              <p className="text-sm text-gray-500 mt-1">
                                {formatDate(order.date)} • {order.items?.length || 0} item(s)
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-bold text-green-600">₹{total.toFixed(2)}</p>
                              <span className={`inline-block px-3 py-1 text-xs rounded-full mt-1 ${
                                order.status === 'delivered' ? 'bg-green-100 text-green-800' :
                                order.status === 'shipped' ? 'bg-blue-100 text-blue-800' :
                                order.status === 'processing' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {order.status || 'pending'}
                              </span>
                            </div>
                          </div>
                          
                          {/* Order Items Preview */}
                          {(order.items || []).slice(0, 2).map((item, index) => (
                            <div key={index} className="flex items-center gap-3 p-2 bg-white rounded">
                              <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center">
                                <Package className="w-5 h-5 text-gray-500" />
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {item.name || 'Unknown Product'}
                                </p>
                                <p className="text-xs text-gray-500">
                                  Qty: {item.quantity} × ₹{item.price?.toFixed(2) || '0.00'}
                                </p>
                              </div>
                              <div className="text-sm font-medium">
                                ₹{((item.price || 0) * (item.quantity || 1)).toFixed(2)}
                              </div>
                            </div>
                          ))}
                          
                          {(order.items || []).length > 2 && (
                            <p className="text-center text-sm text-gray-500 mt-3">
                              + {(order.items || []).length - 2} more items
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersManagement;