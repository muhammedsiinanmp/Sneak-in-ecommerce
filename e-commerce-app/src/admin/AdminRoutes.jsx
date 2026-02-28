import React from 'react';
import { Routes, Route } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import Dashboard from './pages/Dashboard';
import ProductsManagement from './pages/ProductsManagement';
import OrdersManagement from './pages/OrdersManagement';
import UsersManagement from './pages/UsersManagement';


const AdminRoutes = () => {
  return (
    <AdminLayout>
      <Routes>
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="products" element={<ProductsManagement />} />
        <Route path="orders" element={<OrdersManagement />} />
        <Route path="users" element={<UsersManagement />} />
        <Route path="*" element={<Dashboard />} />
      </Routes>
    </AdminLayout>
  );
};

export default AdminRoutes;