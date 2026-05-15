import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { format, parseISO, isToday, isPast } from 'date-fns'
import { ru } from 'date-fns/locale'
import OrderModal from '../components/OrderModal'

export default function Dashboard() {
  const [orders, setOrders] = useState([])
  const [inventory, setInventory] = useState([])
  const [monthRevenue, setMonthRevenue] = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const monthStart = format(new Date(), 'yyyy-MM') + '-01'
    const [{ data: inv }, { data: ord }, { data: revOrd }] = await Promise.all([
      supabase.from('inventory').select('*').order('id'),
      supabase.from('orders')
        .select('*, clients(name, phone), order_items(quantity, inventory_id, inventory(name))')
        .neq('status', 'done')
        .order('start_date'),
      supabase.from('orders')
        .select('total_amount, created_at')
        .gte('created_at', monthStart),
    ])
    setInventory(inv || [])
    setOrders(ord || [])
    setMonthRevenue((revOrd || []).reduce((s, o) => s + (o.total_amount || 0), 0))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const todayStr = format(new Date(), 'yyyy-MM-dd')

  const busyCounts = {}
  inventory.forEach(i => { busyCounts[i.id] = 0 })
  orders.forEach(o => {
    if (o.start_date <= todayStr && o.end_date >= todayStr) {
      ;(o.order_items || []).forEach(it => {
        busyCounts[it.inventory_id] = (busyCounts[it.inventory_id] || 0) + it.quantity
      })
    }
  })

  const returningToday = orders.filter(o => o.end_date === todayStr)
  const activeOrders = orders.filter(o => o.start_date <= todayStr && o.end_date >= todayStr)

  function statusBadge(o) {
    const rest = (o.total_amount || 0) - (o.prepayment || 0)
    if (isPast(parseISO(o.end_date)) && o.status !== 'done') return <span className="badge badge-red">Просрочен</span>
    if (rest <= 0) return <span className="badge badge-green">Оплачен</span>
    if ((o.prepayment || 0) > 0) return <span className="badge badge-amber">Предоплата</span>
    return <span className="badge badge-amber">Ожидает оплаты</span>
  }

  function itemsSummary(o) {
    return (o.order_items || [])
      .filter(it => it.quantity > 0)
      .map(it => `${it.quantity} ${it.inventory?.name || ''}`)
      .join(' · ')
  }

  async function markDone(id, e) {
    e.stopPropagation()
    await supabase.from('orders').update({ status: 'done' }).eq('id', id)
    load()
  }

  return (
    <>
      <div className="page-header">
        <span className="page-title">Обзор</span>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Новый заказ
        </button>
      </div>

      <div className="page-body">
        {/* STATS */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Активных заказов</div>
            <div className="stat-value">{activeOrders.length}</div>
            <div className="stat-sub">прямо сейчас</div>
          </div>
          {inventory.map(inv => (
            <div className="stat-card" key={inv.id}>
              <div className="stat-label">Свободно · {inv.name}</div>
              <div className="stat-value" style={{color: (inv.total_qty - (busyCounts[inv.id]||0)) === 0 ? 'var(--red)' : 'var(--green)'}}>
                {inv.total_qty - (busyCounts[inv.id] || 0)}
              </div>
              <div className="stat-sub">из {inv.total_qty}</div>
            </div>
          ))}
          <div className="stat-card">
            <div className="stat-label">Выручка в этом месяце</div>
            <div className="stat-value">{monthRevenue.toLocaleString('ru-RU')} ₽</div>
            <div className="stat-sub">{orders.length} заказов всего</div>
          </div>
        </div>

        {/* RETURNING TODAY */}
        {returningToday.length > 0 && (
          <div>
            <div className="section-title" style={{marginBottom:10}}>
              🔔 Сегодня возвращают ({returningToday.length})
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {returningToday.map(o => (
                <div key={o.id} className="card card-sm" style={{display:'flex',alignItems:'center',justifyContent:'space-between',borderLeft:'3px solid var(--amber)'}}>
                  <div>
                    <span style={{fontWeight:600,fontSize:16}}>{o.clients?.name}</span>
                    <span style={{color:'var(--text-muted)',fontSize:14,marginLeft:12}}>{itemsSummary(o)}</span>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:12}}>
                    <span style={{fontWeight:600}}>{(o.total_amount||0).toLocaleString('ru-RU')} ₽</span>
                    <button className="btn btn-sm btn-outline" onClick={e => markDone(o.id, e)}>Вернули ✓</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ACTIVE ORDERS TABLE */}
        <div>
          <div className="section-title" style={{marginBottom:10}}>Активные заказы</div>
          <div className="card" style={{padding:0,overflow:'hidden'}}>
            {loading ? <div className="empty">Загрузка...</div> : activeOrders.length === 0 ? (
              <div className="empty">Нет активных заказов</div>
            ) : (
              <>
              <div className="mobile-cards" style={{padding:'10px'}}>
                {activeOrders.map(o => {
                  const rest = (o.total_amount||0) - (o.prepayment||0)
                  return (
                    <div key={o.id+'m'} className="mobile-card">
                      <div className="mobile-card-top">
                        <div>
                          <div className="mobile-card-name">{o.clients?.name}</div>
                          <div className="mobile-card-phone">{o.clients?.phone}</div>
                        </div>
                        <div className="mobile-card-amount">{(o.total_amount||0).toLocaleString('ru-RU')} ₽</div>
                      </div>
                      <div className="mobile-card-row">
                        <span style={{fontSize:14,color:'var(--text-muted)'}}>{itemsSummary(o)}</span>
                        <span style={{color:rest>0?'var(--amber)':'var(--green)',fontWeight:600,fontSize:14}}>
                          {rest>0?`Ост. ${rest.toLocaleString('ru-RU')} ₽`:'✓'}
                        </span>
                      </div>
                      <div className="mobile-card-row">
                        <span>{format(parseISO(o.start_date),'d MMM',{locale:ru})} – {format(parseISO(o.end_date),'d MMM',{locale:ru})}</span>
                        {statusBadge(o)}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Клиент</th>
                      <th>Мебель</th>
                      <th>Даты</th>
                      <th>Сумма</th>
                      <th>Остаток</th>
                      <th>Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeOrders.map(o => {
                      const rest = (o.total_amount||0) - (o.prepayment||0)
                      return (
                        <tr key={o.id}>
                          <td>
                            <div className="td-name">{o.clients?.name}</div>
                            <div className="td-sub">{o.clients?.phone}</div>
                          </td>
                          <td style={{color:'var(--text-muted)',fontSize:14}}>{itemsSummary(o)}</td>
                          <td>
                            <div>{format(parseISO(o.start_date),'d MMM',{locale:ru})} – {format(parseISO(o.end_date),'d MMM',{locale:ru})}</div>
                          </td>
                          <td className="td-amount">{(o.total_amount||0).toLocaleString('ru-RU')} ₽</td>
                          <td style={{color: rest > 0 ? 'var(--amber)' : 'var(--green)', fontWeight:600}}>
                            {rest > 0 ? `${rest.toLocaleString('ru-RU')} ₽` : '✓'}
                          </td>
                          <td>{statusBadge(o)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
        </div>
      </div>

      {showModal && <OrderModal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load() }} />}
    </>
  )
}
