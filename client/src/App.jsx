import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { getToken, clearToken } from './api';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Clientes from './pages/Clientes';
import OrdensList from './pages/OrdensList';
import OSForm from './pages/OSForm';
import OSDetalhe from './pages/OSDetalhe';
import Estoque from './pages/Estoque';
import OrcamentoPublico from './pages/OrcamentoPublico';

function Layout({ children }) {
  const navigate = useNavigate();
  return (
    <div className="layout">
      <nav className="topbar">
        <span className="brand">🔧 OficinaOS</span>
        <NavLink to="/">Painel</NavLink>
        <NavLink to="/os">Ordens</NavLink>
        <NavLink to="/clientes">Clientes</NavLink>
        <NavLink to="/estoque">Estoque</NavLink>
        <button className="link-btn" onClick={() => { clearToken(); navigate('/login'); }}>
          Sair
        </button>
      </nav>
      <main className="content">{children}</main>
    </div>
  );
}

function Private({ children }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/orcamento/:token" element={<OrcamentoPublico />} />
      <Route path="/" element={<Private><Dashboard /></Private>} />
      <Route path="/os" element={<Private><OrdensList /></Private>} />
      <Route path="/os/nova" element={<Private><OSForm /></Private>} />
      <Route path="/os/:id/editar" element={<Private><OSForm /></Private>} />
      <Route path="/os/:id" element={<Private><OSDetalhe /></Private>} />
      <Route path="/clientes" element={<Private><Clientes /></Private>} />
      <Route path="/estoque" element={<Private><Estoque /></Private>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
