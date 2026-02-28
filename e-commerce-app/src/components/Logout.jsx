import React, { useContext } from 'react'
import { AuthContext } from '../context/AuthContext'

const Logout = () => {

  const { logout, user } = useContext(AuthContext);

  if (!user) return null; // Hide logout button if not logged in

  return (
    <button
      onClick={logout}
      className="bg-black text-white px-6 py-2 rounded-md hover:bg-gray-900 transition"
    >
      Logout
    </button>
  );
}

export default Logout;
