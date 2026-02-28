import React, { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

const Profile = () => {

  const { user } = useContext(AuthContext);

  if (!user) {
    return (
      <div className="w-full text-center mt-20 text-gray-700 text-xl">
        You are not logged in.
      </div>
    );
  }

  return (
    <div className="border-t pt-10 flex justify-center">
      <div className="w-[90%] max-w-md bg-white shadow-md rounded-lg p-6">

        <h1 className="text-2xl font-semibold mb-5 text-gray-800">
          My Profile
        </h1>

        <div className="flex flex-col gap-4 text-gray-700">

          <div>
            <p className="text-sm font-semibold text-gray-500">Name</p>
            <p className="text-lg">{user.name}</p>
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-500">Email</p>
            <p className="text-lg">{user.email}</p>
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-500">Account Created</p>
            <p className="text-lg">
              {user.createdAt 
                ? new Date(user.createdAt).toDateString()
                : "Not available"}
            </p>
          </div>

        </div>

      </div>
    </div>
  );
};

export default Profile;
