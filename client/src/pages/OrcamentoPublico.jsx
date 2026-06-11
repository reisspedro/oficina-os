import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

const fmt = (n) => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function OrcamentoPublico() {
  const { token } = useParams();
  const [os, setOs] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/public/os/${token}`)
      .then((r) => r.json().then((d) => (r.ok ? setOs(d) : setError(d.error))))
      .catch(() => setError('Erro ao carregar orçamento'));
  }, [token]);

  if (error) return <div className="print-page"><p className="error">{error}</p></div>;
  if (!os) return <div className="print-page"><p>Carregando…</p></div>;

  return (
    <div className="print-page">
      <div className="print-head">
        <h1>{os.shop?.shop_name}</h1>
        {os.shop?.shop_phone && <p>📞 {os.shop.shop_phone}</p>}
        <h2>Orçamento OS-{os.id}</h2>
        <p>{os.created_at?.slice(0, 10).split('-').reverse().join('/')}</p>
      </div>

      <p><b>Cliente:</b> {os.client?.name || '—'}</p>
      <p><b>Veículo:</b> {os.vehicle} {os.plate && `· Placa ${os.plate}`}</p>
      {os.description && <p><b>Serviço:</b> {os.description}</p>}

      <table className="print-table">
        <thead><tr><th>Item</th><th>Qtd</th><th>Unit.</th><th>Total</th></tr></thead>
        <tbody>
          {os.items.map((it) => (
            <tr key={it.id}>
              <td>{it.description}</td>
              <td>{it.qty}</td>
              <td>{fmt(it.unit_price)}</td>
              <td>{fmt(it.qty * it.unit_price)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan={3}>Subtotal</td><td>{fmt(os.subtotal)}</td></tr>
          {os.discount > 0 && <tr><td colSpan={3}>Desconto</td><td>- {fmt(os.discount)}</td></tr>}
          <tr><td colSpan={3}><b>TOTAL</b></td><td><b>{fmt(os.total)}</b></td></tr>
        </tfoot>
      </table>

      <p className="print-note">Orçamento válido por 15 dias. Valores sujeitos a alteração após desmontagem.</p>
      <button className="no-print btn" onClick={() => window.print()}>🖨️ Imprimir / Salvar PDF</button>
    </div>
  );
}
