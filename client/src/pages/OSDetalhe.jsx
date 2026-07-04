import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, fmt, STATUS_LABELS } from '../api';

const NEXT = {
  orcamento: 'aprovada',
  aprovada: 'em_execucao',
  em_execucao: 'pronta',
  pronta: 'entregue',
};
const NEXT_LABEL = {
  orcamento: '✅ Aprovar orçamento',
  aprovada: '🔧 Iniciar execução',
  em_execucao: '🏁 Marcar como pronta',
  pronta: '📦 Entregar',
};

export default function OSDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [os, setOs] = useState(null);
  const [error, setError] = useState('');

  const load = () => api(`/api/os/${id}`).then(setOs).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]);

  async function setStatus(status) {
    try {
      setOs(await api(`/api/os/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }));
    } catch (err) { setError(err.message); }
  }

  async function togglePaid() {
    try {
      setOs(await api(`/api/os/${id}/pay`, { method: 'POST', body: JSON.stringify({ paid: !os.paid_at }) }));
    } catch (err) { setError(err.message); }
  }

  async function remove() {
    if (!confirm('Excluir esta OS? Não tem volta.')) return;
    await api(`/api/os/${id}`, { method: 'DELETE' });
    navigate('/os');
  }

  if (error) return <p className="error">{error}</p>;
  if (!os) return <p className="muted">Carregando…</p>;

  const shareUrl = `${window.location.origin}/orcamento/${os.share_token}`;
  const waText = encodeURIComponent(
    `Olá${os.client?.name ? ` ${os.client.name}` : ''}! Segue o orçamento do seu veículo ${os.vehicle}: ${shareUrl}`
  );
  const waLink = os.client?.phone
    ? `https://wa.me/55${os.client.phone.replace(/\D/g, '')}?text=${waText}`
    : `https://wa.me/?text=${waText}`;

  return (
    <div>
      <div className="page-head">
        <h2>
          OS-{os.id} <span className={`badge st-${os.status}`}>{STATUS_LABELS[os.status]}</span>
          {os.status === 'entregue' && (
            <span className={`badge ${os.paid_at ? 'st-entregue' : 'st-cancelada'}`}>
              {os.paid_at ? '✓ Pago' : '$ A receber'}
            </span>
          )}
        </h2>
        <div>
          <Link className="btn ghost" to={`/os/${os.id}/editar`}>Editar</Link>{' '}
          <a className="btn ghost" href={shareUrl} target="_blank" rel="noreferrer">🖨️ Imprimir</a>{' '}
          <a className="btn wa" href={waLink} target="_blank" rel="noreferrer">📲 Enviar WhatsApp</a>
        </div>
      </div>

      <div className="card">
        <p><b>Cliente:</b> {os.client?.name || '—'} {os.client?.phone && `· ${os.client.phone}`}</p>
        <p><b>Veículo:</b> {os.vehicle || '—'} {os.plate && `· Placa ${os.plate}`}</p>
        {os.description && <p><b>Problema:</b> {os.description}</p>}
        <p className="muted">Criada em {os.created_at?.slice(0, 16).replace('T', ' ')}</p>
      </div>

      <table className="card table">
        <thead><tr><th>Tipo</th><th>Descrição</th><th>Qtd</th><th>Unit.</th><th>Total</th></tr></thead>
        <tbody>
          {os.items.map((it) => (
            <tr key={it.id}>
              <td>{it.type === 'peca' ? 'Peça' : 'Serviço'}</td>
              <td>{it.description}</td>
              <td>{it.qty}</td>
              <td>{fmt(it.unit_price)}</td>
              <td>{fmt(it.qty * it.unit_price)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan={4}>Subtotal</td><td>{fmt(os.subtotal)}</td></tr>
          {os.discount > 0 && <tr><td colSpan={4}>Desconto</td><td>- {fmt(os.discount)}</td></tr>}
          <tr className="total-row"><td colSpan={4}><b>Total</b></td><td><b>{fmt(os.total)}</b></td></tr>
        </tfoot>
      </table>

      <div className="actions-row">
        {NEXT[os.status] && (
          <button className="btn" onClick={() => setStatus(NEXT[os.status])}>
            {NEXT_LABEL[os.status]}
          </button>
        )}
        {os.status === 'aprovada' && (
          <button className="btn ghost" onClick={() => setStatus('orcamento')}>↩️ Voltar pra orçamento</button>
        )}
        {os.status === 'entregue' && (
          <button className="btn ghost" onClick={togglePaid}>
            {os.paid_at ? '↩️ Desfazer pagamento' : '💰 Marcar como pago'}
          </button>
        )}
        {os.status !== 'cancelada' && os.status !== 'entregue' && (
          <button className="btn ghost danger" onClick={() => setStatus('cancelada')}>Cancelar OS</button>
        )}
        <button className="link-btn danger" onClick={remove}>Excluir</button>
      </div>
    </div>
  );
}
