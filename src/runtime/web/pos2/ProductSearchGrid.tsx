import React, {useState, useEffect, useRef, useMemo} from 'react';
import {Search, Barcode, Star, Grid, List, Filter, X} from 'lucide-react';
import type {BusinessRecord} from '../session';

interface ProductSearchGridProps {
  products: BusinessRecord[];
  outletId: string;
  favorites: Set<string>;
  onProductSelect: (product: BusinessRecord) => void;
  onFavoriteToggle: (productId: string) => void;
  className?: string;
}

export function ProductSearchGrid({
  products,
  outletId,
  favorites,
  onProductSelect,
  onFavoriteToggle,
  className = ''
}: ProductSearchGridProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [scannerInput, setScannerInput] = useState('');
  const scannerRef = useRef<HTMLInputElement>(null);
  const [scannerActive, setScannerActive] = useState(false);

  const categories = useMemo(() => 
    [...new Set(products.map(p => String(p.data.category || 'GENERAL')))].sort(),
  [products]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesCategory = !category || String(p.data.category || 'GENERAL') === category;
      const matchesFavorites = !favoritesOnly || favorites.has(p.id);
      const matchesQuery = !query || 
        `${p.data.name || ''} ${p.data.code || ''}`.toLowerCase().includes(query.toLowerCase());
      return matchesCategory && matchesFavorites && matchesQuery;
    });
  }, [products, category, favoritesOnly, query, favorites]);

  const handleScannerInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setScannerInput(value);
    
    if (value.length >= 8) {
      const match = products.find(p => 
return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 p-4 bg-slate-950 border-b border-slate-800">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search products..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
            autoFocus
          />
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
          >
            <option value="">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          <div className="flex bg-slate-900 rounded-lg border border-slate-700 p-1">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded ${viewMode === 'grid' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
              aria-label="Grid view"
            >
              <Grid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-2 rounded ${viewMode === 'list' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
              aria-label="List view"
            >
              <List className="h-4 w-4" />
            </button>
<div className="flex-1 overflow-y-auto p-4">
        {query || category || favoritesOnly ? (
          <div className="flex items-center justify-center gap-2 text-sm text-slate-400 mb-4">
            <Filter className="h-4 w-4" />
            <span>{filteredProducts.length} products</span>
            {(query || category || favoritesOnly) && (
              <button
                type="button"
                onClick={() => {setQuery(''); setCategory(''); setFavoritesOnly(false);}}
                className="text-amber-400 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : null}

        {filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500">
            <Search className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-lg">No products found</p>
            <p className="text-sm">Try adjusting your search or filters</p>
          </div>
        ) : (
          viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredProducts.map(product => (
                <ProductCard
                  key={product.id}
                  product={product}
interface ProductCardProps {
  product: BusinessRecord;
  isFavorite: boolean;
  onSelect: (product: BusinessRecord) => void;
  onFavoriteToggle: (productId: string) => void;
}

function ProductCard({product, isFavorite, onSelect, onFavoriteToggle}: ProductCardProps) {
  const price = Number(product.data.priceMinor || 0);
  const formattedPrice = (price / 100).toLocaleString('en-KE', {style: 'currency', currency: 'KES'});
  const routeTo = product.data.routeTo || 'COUNTER';
  const routeColor = routeTo === 'KITCHEN' ? 'bg-emerald-500/20 text-emerald-400' :
                    routeTo === 'BAR' ? 'bg-blue-500/20 text-blue-400' :
                    'bg-slate-500/20 text-slate-400';

  return (
    <button
      type="button"
      onClick={() => onSelect(product)}
      onContextMenu={e => {e.preventDefault(); onFavoriteToggle(product.id);}}
      className="relative group h-28 flex flex-col bg-slate-900 border border-slate-700 rounded-xl hover:border-amber-500/50 hover:bg-slate-800/50 transition-all p-3 focus:outline-none focus:ring-2 focus:ring-amber-400"
    >
      <div className="flex items-start justify-between mb-2">
        <h4 className="font-medium text-white text-sm line-clamp-1 pr-8">{product.data.name}</h4>
        <button
          type="button"
          onClick={e => {e.stopPropagation(); onFavoriteToggle(product.id);}}
          className={`p-1 rounded transition-colors ${
            isFavorite 
              ? 'text-amber-400 bg-amber-500/10' 
              : 'text-slate-500 hover:text-amber-400 hover:bg-amber-500/10'
          }`}
          aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Star className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />
        </button>
      </div>
      
      <div className="flex-1 flex items-center justify-between">
        <span className="text-lg font-bold text-amber-300 tabular-nums">{formattedPrice}</span>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${routeColor}`}>
          {routeTo}
        </span>
      </div>

      {product.data.code && (
        <p className="text-xs text-slate-500 mt-1">{product.data.code}</p>
      )}
    </button>
  );
}

interface ProductListItemProps {
  product: BusinessRecord;
  isFavorite: boolean;
  onSelect: (product: BusinessRecord) => void;
  onFavoriteToggle: (productId: string) => void;
}

function ProductListItem({product, isFavorite, onSelect, onFavoriteToggle}: ProductListItemProps) {
  const price = Number(product.data.priceMinor || 0);
  const formattedPrice = (price / 100).toLocaleString('en-KE', {style: 'currency', currency: 'KES'});
  const routeTo = product.data.routeTo || 'COUNTER';

  return (
    <button
      type="button"
      onClick={() => onSelect(product)}
      onContextMenu={e => {e.preventDefault(); onFavoriteToggle(product.id);}}
      className="w-full flex items-center gap-3 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg hover:border-amber-500/50 hover:bg-slate-800/50 transition-all text-left focus:outline-none focus:ring-2 focus:ring-amber-400"
    >
      <div className="flex-1 min-w-0">
        <p className="font-medium text-white truncate">{product.data.name}</p>
        {product.data.code && <p className="text-xs text-slate-500">{product.data.code}</p>}
      </div>
      <span className="text-lg font-bold text-amber-300 tabular-nums whitespace-nowrap">{formattedPrice}</span>
      <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-400">{routeTo}</span>
      <button
        type="button"
        onClick={e => {e.stopPropagation(); onFavoriteToggle(product.id);}}
        className={`p-1 rounded transition-colors ${
          isFavorite ? 'text-amber-400 bg-amber-500/10' : 'text-slate-500 hover:text-amber-400'
        }`}
      >
        <Star className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />
      </button>
    </button>
  );
}
                  isFavorite={isFavorite(product.id)}
                  onSelect={onProductSelect}
                  onFavoriteToggle={onFavoriteToggle}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredProducts.map(product => (
                <ProductListItem
                  key={product.id}
                  product={product}
                  isFavorite={isFavorite(product.id)}
                  onSelect={onProductSelect}
                  onFavoriteToggle={onFavoriteToggle}
                />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
          </div>

          <button
            type="button"
            onClick={() => setFavoritesOnly(!favoritesOnly)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
              favoritesOnly 
                ? 'bg-amber-500/20 border-amber-700 text-amber-300' 
                : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Star className={`h-4 w-4 ${favoritesOnly ? 'fill-current' : ''}`} />
            <span className="hidden sm:inline">Favorites</span>
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => {setScannerActive(!scannerActive); setScannerInput('');}}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                scannerActive
                  ? 'bg-sky-500/20 border-sky-700 text-sky-300'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Barcode className="h-4 w-4" />
              <span className="hidden sm:inline">Scanner</span>
            </button>
            {scannerActive && (
              <input
                ref={scannerRef}
                type="text"
                value={scannerInput}
                onChange={handleScannerInput}
                onBlur={() => setTimeout(() => setScannerActive(false), 100)}
                onKeyDown={e => {if (e.key === 'Escape') setScannerActive(false);}}
                className="absolute right-0 top-full mr-2 mt-1 w-64 px-3 py-2 rounded-lg bg-slate-900 border border-sky-500 text-white text-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
                placeholder="Scan or type barcode..."
                autoFocus
              />
            )}
          </div>
        </div>
      </div>
        p.data.barcode === value || 
        (Array.isArray(p.data.barcodeAliases) && p.data.barcodeAliases.includes(value))
      );
      if (match) {
        onProductSelect(match);
        setScannerInput('');
        if (scannerRef.current) scannerRef.current.blur();
      }
    }
  };

  const isFavorite = (productId: string) => favorites.has(productId);