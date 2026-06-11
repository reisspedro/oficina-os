import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../api';

export default function Login() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', shop_name: '', shop_phone: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await api(mode === 'login' ? '/api/login' : '/api/register', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setToken(data.token);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <h1>🔧 OficinaOS</h1>
        <p className="muted">Ordens de serviço, orçamentos e estoque da sua oficina</p>
        {mode === 'register' && (
          <>
            <input placeholder="Seu nome" value={form.name} onChange={set('name')} required />
            <input placeholder="Nome da oficina" value={form.shop_name} onChange={set('shop_name')} required />
            <input placeholder="Telefone da oficina (com DDD)" value={form.shop_phone} onChange={set('shop_phone')} />
          </>
        )}
        <input type="email" placeholder="E-mail" value={form.email} onChange={set('email')} required />
        <input type="password" placeholder="Senha" value={form.password} onChange={set('password')} required />
        {error && <p className="error">{error}</p>}
        <button disabled={busy}>{mode === 'login' ? 'Entrar' : 'Criar conta'}</button>
        <button type="button" className="link-btn" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Não tem conta? Cadastre sua oficina' : 'Já tem conta? Entrar'}
        </button>
      </form>
    </div>
  );
}
