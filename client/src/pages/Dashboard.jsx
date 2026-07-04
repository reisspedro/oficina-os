import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmt, STATUS_LABELS } from '../api';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/dashboard').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Carregando…</p>;

  return (
    <div>
      <div className="page-head">
        <h2>Painel</h2>
        <Link className="btn" to="/os/nova">+ Nova OS</Link>
      </div>

      <div className="cards-row">
        <div className="card stat">
          <span className="stat-num">{fmt(data.revenue_month)}</span>
          <span className="muted">Faturado no mês ({data.delivered_month} OS entregues)</span>
        </div>
        {data.unpaid_count > 0 && (
          <Link to="/os?status=entregue" className="card stat">
            <span className="stat-num">{fmt(data.to_receive)}</span>
            <span className="muted">A receber ({data.unpaid_count} OS entregues sem pagamento)</span>
          </Link>
        )}
        {['orcamento', 'aprovada', 'em_execucao', 'pronta'].map((s) => (
          <Link key={s} to={`/os?status=${s}`} className="card stat">
            <span className="stat-num">{data.counts[s]}</span>
            <span className="muted">{STATUS_LABELS[s]}</span>
          </Link>
        ))}
      </div>

      {data.low_stock.length > 0 && (
        <div className="card warn">
          <h3>⚠️ Estoque baixo</h3>
          <ul>
            {data.low_stock.map((p) => (
              <li key={p.id}>{p.name} — restam <b>{p.qty}</b> (mínimo {p.min_qty})</li>
            ))}
          </ul>
          <Link to="/estoque">Ver estoque →</Link>
        </div>
      )}
    </div>
  );
}
