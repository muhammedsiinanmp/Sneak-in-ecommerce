import React, { useContext, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const Login = () => {

  const { login, signup } = useContext(AuthContext);
  const navigate = useNavigate();

  const [currentState, setCurrentState] = useState('Sign Up');
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const onSubmitHandler = async (e) => {
    e.preventDefault();

    if (currentState === "Login") {
      const result = await login(email, password);

      if (result.success) {
        if (result.admin) {
          navigate("/admin/dashboard");
        } else {
          navigate("/");
        }
      }

    } else {
      const result = await signup(name, email, password);

      if (result.success) {
        navigate("/"); // signup is always normal user
      }
    }
  };


  return (
    <form
      onSubmit={onSubmitHandler}
      className='flex flex-col items-center w-[90%] sm:max-w-96 m-auto mt-14 gap-4 text-gray-800'
    >
      <div className='inline-flex items-center gap-2 mb-2 mt-10'>
        <p className='prata-regular text-3xl '>{currentState}</p>
        <hr className='border-none h-[1.5px] w-8 bg-gray-800' />
      </div>

      {currentState !== "Login" && (
        <input
          type="text"
          className='w-full px-3 py-2 border border-gray-800'
          placeholder='Name'
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      )}

      <input
        type="email"
        className='w-full px-3 py-2 border border-gray-800'
        placeholder='Email'
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <input
        type="password"
        className='w-full px-3 py-2 border border-gray-800'
        placeholder='Password'
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <div className='w-full flex justify-between text-sm mt-[-8px]'>
        <p className='cursor-pointer'>Forgot your password ?</p>

        {currentState === 'Login' ? (
          <p onClick={() => setCurrentState('Sign Up')} className='cursor-pointer'>
            Create account
          </p>
        ) : (
          <p onClick={() => setCurrentState('Login')} className='cursor-pointer'>
            Login here
          </p>
        )}
      </div>

      <button className='bg-black text-white font-light px-8 py-2 mt-4'>
        {currentState === 'Login' ? 'Sign In' : 'Sign Up'}
      </button>
    </form>
  );
};

export default Login;
