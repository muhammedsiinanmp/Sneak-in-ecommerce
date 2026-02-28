import React, { useEffect, useState } from "react";

const API = "http://localhost:3001";

const emptyProduct = {
  id: "",
  name: "",
  price: "", 
  category: "",
  subcategory: "",
  sizes: [],
  image: [],
  description: "",
  inStock: true,        
  isBestseller: false   
};

const AdminProducts = () => {
  const [products, setProducts] = useState([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      const res = await fetch(`${API}/products`);
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setProducts([]);
    }
  };

  const openNew = () => {
    setEditing({ ...emptyProduct, id: Date.now().toString() });
    setModalOpen(true);
  };

  const openEdit = (p) => {
    setEditing({ ...p });
    setModalOpen(true);
  };

  const save = async (product) => {
    try {
      const exists = products.some(x => String(x.id) === String(product.id));
      if (exists) {
        await fetch(`${API}/products/${product.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(product)
        });
      } else {
        await fetch(`${API}/products`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(product)
        });
      }
      setModalOpen(false);
      load();
    } catch (err) {
      console.error(err);
      alert("Failed to save product");
    }
  };

  const remove = async (id) => {
    if (!confirm("Delete this product?")) return;
    try {
      await fetch(`${API}/products/${id}`, { method: "DELETE" });
      load();
    } catch (err) {
      console.error(err);
      alert("Failed to delete");
    }
  };

  const filtered = products.filter(p => 
    p.name.toLowerCase().includes(q.toLowerCase()) || 
    (p.category || "").toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-semibold">Products</h3>
        <div className="flex items-center gap-3">
          <input 
            value={q} 
            onChange={(e) => setQ(e.target.value)} 
            placeholder="Search products" 
            className="border px-3 py-2 rounded" 
          />
          <button 
            onClick={openNew} 
            className="bg-black text-white px-4 py-2 rounded"
          >
            New Product
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map(p => (
          <div key={p.id} className="p-4 rounded bg-white shadow-sm flex gap-4">
            <img 
              src={p.image?.[0] || "https://via.placeholder.com/120"} 
              className="w-28 h-20 object-cover rounded" 
              alt={p.name} 
            />
            <div className="flex-1">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-semibold flex items-center gap-2">
                    {p.name}
                    {p.isBestseller && (
                      <span className="text-xs bg-yellow-400 text-black px-2 py-0.5 rounded">
                        Bestseller
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500">₹{p.price?.toLocaleString()}</div>
                  <div className="text-xs text-gray-400 mt-2">
                    {p.category} / {p.subcategory}
                  </div>
                  <div className={`text-xs mt-1 ${p.inStock ? 'text-green-600' : 'text-red-600'}`}>
                    {p.inStock ? '✓ In Stock' : '✗ Out of Stock'}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <button 
                    onClick={() => openEdit(p)} 
                    className="text-blue-600 text-sm"
                  >
                    Edit
                  </button>
                  <button 
                    onClick={() => remove(p.id)} 
                    className="text-red-600 text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <p className="text-sm mt-2 text-gray-700">
                {p.description?.slice(0, 120)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {modalOpen && (
        <ProductModal 
          product={editing} 
          onClose={() => setModalOpen(false)} 
          onSave={save} 
        />
      )}

      {filtered.length === 0 && (
        <div className="text-gray-500 mt-8">No products found.</div>
      )}
    </div>
  );
};

export default AdminProducts;

/* ProductModal Component */
const ProductModal = ({ product, onClose, onSave }) => {
  const [form, setForm] = useState(product || {});
  
  useEffect(() => setForm(product || {}), [product]);

  function updateField(k, v) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  function toggleSize(sz) {
    const sizes = Array.isArray(form.sizes) ? form.sizes.slice() : [];
    if (sizes.includes(sz)) {
      setForm(prev => ({ ...prev, sizes: sizes.filter(s => s !== sz) }));
    } else {
      setForm(prev => ({ ...prev, sizes: [...sizes, sz] }));
    }
  }

  function addImage(url) {
    const images = Array.isArray(form.image) ? form.image.slice() : [];
    setForm(prev => ({ ...prev, image: [...images, url] }));
  }

  function removeImage(idx) {
    const images = Array.isArray(form.image) ? form.image.slice() : [];
    images.splice(idx, 1);
    setForm(prev => ({ ...prev, image: images }));
  }

  const handleSave = () => {
    const productToSave = {
      ...form,
      price: Number(form.price) || 0
    };
    onSave(productToSave);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-6 overflow-y-auto">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white w-full max-w-2xl rounded shadow-lg p-6 z-10 my-8">
        <div className="flex justify-between items-center mb-4">
          <h4 className="font-semibold">
            {product?.id ? "Edit product" : "New product"}
          </h4>
          <button onClick={onClose} className="text-gray-500">Close</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input 
            value={form.name || ""} 
            onChange={(e) => updateField("name", e.target.value)} 
            placeholder="Product Name" 
            className="border px-3 py-2 rounded" 
          />
          
    
          <input 
            type="number"
            value={form.price === 0 || form.price === "" ? "" : form.price} 
            onChange={(e) => updateField("price", e.target.value)} 
            placeholder="Price (₹)" 
            className="border px-3 py-2 rounded" 
          />
          
          <input 
            value={form.category || ""} 
            onChange={(e) => updateField("category", e.target.value)} 
            placeholder="Category (e.g., Men,Women)" 
            className="border px-3 py-2 rounded" 
          />
          
          <input 
            value={form.subcategory || ""} 
            onChange={(e) => updateField("subcategory", e.target.value)} 
            placeholder="Subcategory (e.g., Sandals,Sneakers)" 
            className="border px-3 py-2 rounded" 
          />

          <textarea 
            value={form.description || ""} 
            onChange={(e) => updateField("description", e.target.value)} 
            placeholder="Product Description" 
            className="border px-3 py-2 col-span-1 md:col-span-2 rounded" 
            rows="3"
          />
        </div>

        {/* NEW: Checkboxes for InStock and Bestseller */}
        <div className="mt-4 flex gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="checkbox"
              checked={form.inStock ?? true}
              onChange={(e) => updateField("inStock", e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm font-medium">In Stock</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="checkbox"
              checked={form.isBestseller ?? false}
              onChange={(e) => updateField("isBestseller", e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm font-medium">Bestseller</span>
          </label>
        </div>

        <div className="mt-4">
          <div className="text-sm font-medium mb-2">Sizes (click to toggle)</div>
          <div className="flex flex-wrap gap-2">
            {["5","6","7","8","9","10","11","12"].map(sz => (
              <button 
                key={sz} 
                onClick={() => toggleSize(sz)} 
                className={`px-3 py-1 border rounded ${
                  Array.isArray(form.sizes) && form.sizes.includes(sz) 
                    ? "bg-black text-white" 
                    : "hover:bg-gray-100"
                }`}
              >
                {sz}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <div className="text-sm font-medium mb-2">Product Images</div>
          <div className="flex gap-2 items-center">
            <input 
              placeholder="Image URL" 
              className="border px-3 py-2 flex-1 rounded" 
              id="img-url" 
            />
            <button 
              onClick={() => {
                const el = document.getElementById("img-url");
                if (!el || !el.value) return;
                addImage(el.value);
                el.value = "";
              }} 
              className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-900"
            >
              Add
            </button>
          </div>
          <div className="flex gap-2 mt-3 flex-wrap">
            {(form.image || []).map((u, i) => (
              <div key={i} className="relative group">
                <img 
                  src={u} 
                  alt={`img-${i}`} 
                  className="w-24 h-20 object-cover rounded border" 
                />
                <button 
                  onClick={() => removeImage(i)} 
                  className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-700"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          {(!form.image || form.image.length === 0) && (
            <div className="text-xs text-gray-400 mt-2">No images added yet</div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3 pt-4 border-t">
          <button 
            onClick={onClose} 
            className="px-5 py-2 border rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave} 
            className="px-5 py-2 bg-black text-white rounded hover:bg-gray-800"
          >
            Save Product
          </button>
        </div>
      </div>
    </div>
  );
};