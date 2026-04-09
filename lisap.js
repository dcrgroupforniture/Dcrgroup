/* Solo per lisap.html */

.lisap-toolbar{
  display:flex;
  gap: 12px;
  align-items:center;
  justify-content: space-between;
  margin: 14px 0 14px 0;
  flex-wrap: wrap;
}

.lisap-toolbar input{
  flex: 1;
  min-width: 220px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #d1d5db;
  outline: none;
}

.lisap-toolbar input:focus{
  border-color: #1f4fd8;
  box-shadow: 0 0 0 3px rgba(31,79,216,.12);
}

.lisap-count{
  font-size: 14px;
  opacity: .85;
}

.table-wrap{
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  overflow: hidden;
}

.price-table{
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.price-table thead th{
  position: sticky;
  top: 0;
  background: #f8fafc;
  z-index: 1;
  text-align: left;
  padding: 12px 12px;
  border-bottom: 1px solid #e5e7eb;
  font-weight: 800;
}

.price-table td{
  padding: 10px 12px;
  border-bottom: 1px solid #eef2f7;
  vertical-align: middle;
}

.price-table tbody tr:hover{
  background: #f6f8ff;
}

.price-table .num{
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 560px){
  .price-table{
    font-size: 13px;
  }
  .price-table thead th,
  .price-table td{
    padding: 10px 10px;
  }
} 