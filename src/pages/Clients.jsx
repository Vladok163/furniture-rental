import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { format, parseISO } from 'date-fns'
import { ru } from 'date-fns/locale'
import OrderModal from '../components/OrderModal'

export default function Clients() {
  const [clients, setClients] = useState([])
  const [orderCounts, setOrderCounts] = useState({})
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [clientOrders, setClientOrders] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { data: cl } = await supabase.from('clients').select('*').order('created_at', { ascending: false })
    const { data: ord } = await supabase.from('orders').select('client_id')
    const counts = {}
    ;(ord || []).forEach(o => { counts[o.client_id] = (counts[o.client_id] || 0) + 1 })
    setClients(cl || [])
    setOrderCounts(counts)
    setLoading(false)
  }

  async function loadClientOrders(clientId) {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(quantity, inventory(name))')
      .eq('client_id', clientId)
      .order('start_date', { ascending: false })
    setClientOrders(data || [])
  }

  useEffect(() => { load() }, [])

  function selectClient(c) {
    setSelected(c)
    loadClientOrders(c.id)
  }

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || '').includes(search)
  )

  function itemsSummary(o) {
    return (o.order_items || []).filter(i => i.quantity > 0)
      .map(i => `${i.quantity} ${i.inventory?.name || ''}`).join(' · ')
  }

  const sourceBadge = (s) => {
    const map = { 'Авито': 'badge-amber', 'Сарафан': 'badge-green', 'Повторный': 'badge-gray', 'Другое': 'badge-gray' }
    return <span className={`badge ${map[s] || 'badge-gray'}`}>{s}</span>
  }

  return (
    <>
      <div className="page-header">
        <span className="page-title">Клиенты</span>
      </div>
      <div className="page-body" style={{ flexDirection: 'row', gap: 20, alignItems: 'flex-start' }}>
        {/* LEFT: client list */}
        <div style={{ flex: '0 0 340px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="search-wrap">
            <svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input className="search-input" style={{width:'100%'}} placeholder="Поиск по имени или телефону..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {loading ? <div className="empty">Загрузка...</div> : filtered.length === 0 ? (
              <div className="empty">Нет клиентов</div>
            ) : (
              filtered.map(c => {
                const count = orderCounts[c.id] || 0
                const isRegular = count >= 2
                return (
                  <div key={c.id}
                    onClick={() => selectClient(c)}
                    style={{
                      padding: '14px 18px',
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      background: selected?.id === c.id ? 'var(--bg)' : 'var(--surface)',
                      transition: 'background 0.12s',
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontWeight: 600, fontSize: 16 }}>{c.name}</div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {isRegular && <span className="badge" style={{background:'#e8f0ff',color:'#2255cc'}}>⭐ Постоянный</span>}
                        {sourceBadge(c.source || 'Авито')}
                      </div>
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 3 }}>
                      {c.phone} · {count} заказ{count===1?'':count<5?'а':'ов'}
                    </div>
                    {c.notes && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{c.notes}</div>}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* RIGHT: client detail */}
        {selected ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{selected.name}</div>
                  <div style={{ fontSize: 16, color: 'var(--text-muted)', marginTop: 4 }}>{selected.phone}</div>
                  {selected.notes && <div style={{ fontSize: 15, marginTop: 8 }}>{selected.notes}</div>}
                </div>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Новый заказ</button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                {sourceBadge(selected.source || 'Авито')}
                {(orderCounts[selected.id] || 0) >= 2 && <span className="badge" style={{background:'#e8f0ff',color:'#2255cc'}}>⭐ Постоянный клиент</span>}
                <span className="badge badge-gray">Заказов: {orderCounts[selected.id] || 0}</span>
              </div>
            </div>

            <div className="section-title">История аренды</div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {clientOrders.length === 0 ? <div className="empty">Нет заказов</div> : (
                <table>
                  <thead>
                    <tr>
                      <th>Даты</th>
                      <th>Мебель</th>
                      <th>Сумма</th>
                      <th>Предоплата</th>
                      <th>Остаток</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientOrders.map(o => {
                      const rest = (o.total_amount||0) - (o.prepayment||0)
                      return (
                        <tr key={o.id}>
                          <td style={{fontSize:14}}>
                            {format(parseISO(o.start_date),'d MMM yyyy',{locale:ru})} –<br/>
                            {format(parseISO(o.end_date),'d MMM yyyy',{locale:ru})}
                          </td>
                          <td style={{color:'var(--text-muted)',fontSize:14}}>{itemsSummary(o)}</td>
                          <td className="td-amount">{(o.total_amount||0).toLocaleString('ru-RU')} ₽</td>
                          <td style={{fontSize:15}}>{(o.prepayment||0).toLocaleString('ru-RU')} ₽</td>
                          <td style={{color:rest>0?'var(--amber)':'var(--green)',fontWeight:600}}>
                            {rest > 0 ? `${rest.toLocaleString('ru-RU')} ₽` : '✓'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 16 }}>
            Выберите клиента слева
          </div>
        )}
      </div>

      {showModal && selected && (
        <OrderModal
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); loadClientOrders(selected.id) }}
          prefillClient={selected}
        />
      )}
    </>
  )
}
