import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { format, parseISO } from 'date-fns'
import { ru } from 'date-fns/locale'
import OrderModal from '../components/OrderModal'

export default function Orders() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editOrder, setEditOrder] = useState(null)
  const [filter, setFilter] = useState('all')

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('orders')
      .select('*, clients(name, phone), order_items(quantity, inventory_id, inventory(name))')
      .order('start_date', { ascending: false })
    setOrders(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function markDone(id, e) {
    e.stopPropagation()
    await supabase.from('orders').update({ status: 'done' }).eq('id', id)
    load()
  }

  async function deleteOrder(id, e) {
    e.stopPropagation()
    if (!confirm('Удалить заказ?')) return
    await supabase.from('orders').delete().eq('id', id)
    load()
  }

  function itemsSummary(o) {
    return (o.order_items || []).filter(it => it.quantity > 0)
      .map(it => `${it.quantity} ${it.inventory?.name || ''}`).join(' · ')
  }

  function statusBadge(o) {
    if (o.status === 'done') return <span className="badge badge-gray">Завершён</span>
    const rest = (o.total_amount || 0) - (o.prepayment || 0)
    if (rest <= 0) return <span className="badge badge-green">Оплачен</span>
    if ((o.prepayment || 0) > 0) return <span className="badge badge-amber">Предоплата</span>
    return <span className="badge badge-amber">Ожидает</span>
  }

  const filtered = orders.filter(o => {
    if (filter === 'active') return o.status !== 'done'
    if (filter === 'done') return o.status === 'done'
    return true
  })

  return (
    <>
      <div className="page-header">
        <span className="page-title">Заказы</span>
        <button className="btn btn-primary" onClick={() => { setEditOrder(null); setShowModal(true) }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Новый заказ
        </button>
      </div>
      <div className="page-body">
        <div style={{display:'flex',gap:8}}>
          {[['all','Все'],['active','Активные'],['done','Завершённые']].map(([v,l]) => (
            <button key={v} className={`btn btn-sm ${filter===v?'btn-primary':'btn-outline'}`} onClick={() => setFilter(v)}>{l}</button>
          ))}
        </div>
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          {loading ? <div className="empty">Загрузка...</div> : filtered.length === 0 ? (
            <div className="empty">Нет заказов</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Клиент</th>
                    <th>Мебель</th>
                    <th>Даты</th>
                    <th>Сумма</th>
                    <th>Предоплата</th>
                    <th>Остаток</th>
                    <th>Статус</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(o => {
                    const rest = (o.total_amount||0) - (o.prepayment||0)
                    return (
                      <tr key={o.id} onClick={() => { setEditOrder(o); setShowModal(true) }}>
                        <td>
                          <div className="td-name">{o.clients?.name}</div>
                          <div className="td-sub">{o.clients?.phone}</div>
                        </td>
                        <td style={{color:'var(--text-muted)',fontSize:14}}>{itemsSummary(o)}</td>
                        <td>
                          <div style={{fontSize:14}}>{format(parseISO(o.start_date),'d MMM',{locale:ru})} – {format(parseISO(o.end_date),'d MMM',{locale:ru})}</div>
                        </td>
                        <td className="td-amount">{(o.total_amount||0).toLocaleString('ru-RU')} ₽</td>
                        <td style={{fontSize:15}}>{(o.prepayment||0).toLocaleString('ru-RU')} ₽</td>
                        <td style={{color: rest>0?'var(--amber)':'var(--green)',fontWeight:600}}>
                          {rest > 0 ? `${rest.toLocaleString('ru-RU')} ₽` : '✓'}
                        </td>
                        <td>{statusBadge(o)}</td>
                        <td>
                          <div style={{display:'flex',gap:6}} onClick={e=>e.stopPropagation()}>
                            {o.status !== 'done' && (
                              <button className="btn btn-sm btn-outline" onClick={e=>markDone(o.id,e)}>✓ Завершить</button>
                            )}
                            <button className="btn btn-sm btn-outline" style={{color:'var(--red)'}} onClick={e=>deleteOrder(o.id,e)}>✕</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {showModal && (
        <OrderModal
          editOrder={editOrder}
          onClose={() => { setShowModal(false); setEditOrder(null) }}
          onSaved={() => { setShowModal(false); setEditOrder(null); load() }}
        />
      )}
    </>
  )
}
