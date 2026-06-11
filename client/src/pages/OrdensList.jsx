import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, fmt, STATUS_LABELS } from '../api';

export default function OrdensList() {
  const [list, setList] = useState([]);
  const [error, setError] = useState('');
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';

  useEffect(() => {
    api(`/api/os${status ? `?status=${status}` : ''}`)
      .then(setList).catch((e) => setError(e.message));
  }, [status]);

  return (
    <div>
      <div className="page-head">
        <h2>Ordens de Serviço</h2>
        <Link className="btn" to="/os/nova">+ Nova OS</Link>
      </div>

      <div className="filters">
        <button className={`chip ${!status ? 'active' : ''}`} onClick={() => setParams({})}>Todas</button>
        {Object.entries(STATUS_LABELS).map(([k, label]) => (
          <button key={k} className={`chip ${status === k ? 'active' : ''}`}
            onClick={() => setParams({ status: k })}>{label}</button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}

      <table className="card table">
        <thead><tr><th>#</th><th>Cliente</th><th>Veículo</th><th>Status</th><th>Total</th><th>Criada</th></tr></thead>
        <tbody>
          {list.map((os) => (
            <tr key={os.id}>
              <td><Link to={`/os/${os.id}`}>OS-{os.id}</Link></td>
              <td>{os.client?.name || '—'}</td>
              <td>{os.vehicle} {os.plate && `(${os.plate})`}</td>
              <td><span className={`badge st-${os.status}`}>{STATUS_LABELS[os.status]}</span></td>
              <td>{fmt(os.total)}</td>
              <td className="muted">{os.created_at?.slice(0, 10)}</td>
            </tr>
          ))}
          {list.length === 0 && <tr><td colSpan={6} className="muted">Nenhuma OS aqui.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
