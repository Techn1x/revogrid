import isArray from 'lodash/isArray';
import reduce from 'lodash/reduce';

import {
  ColumnData,
  ColumnGrouping,
  ColumnProp,
  ColumnRegular,
  ColumnTypes,
  DimensionCols,
  ViewSettingSizeProp,
} from '@type';
import { Group as StoreGroup } from '@store';

export type ColumnItems = Record<DimensionCols, ColumnRegular[]>;
export interface ColumnGroup extends StoreGroup {
  level: number;
}
export type ColumnGroupingCollection = Record<DimensionCols, ColumnGroup[]>;

export type ColumnCollection = {
  columns: Record<DimensionCols, ColumnRegular[]>;
  columnByProp: Record<ColumnProp, ColumnRegular[]>;
  columnGrouping: ColumnGroupingCollection;
  maxLevel: number;
  sort: Record<ColumnProp, ColumnRegular>;
};

export function getColumnType(rgCol: ColumnRegular): DimensionCols {
  if (rgCol.pin) {
    return rgCol.pin;
  }
  return 'rgCol';
}

export function getColumnSizes(cols: ColumnRegular[]): ViewSettingSizeProp {
  const res: ViewSettingSizeProp = {};
  for (const [i, c] of cols.entries()) {
    if (c.size) {
      res[i] = c.size;
    }
  }
  return res;
}


/**
 * Check if column is grouping column
 */
export function isColGrouping(
  colData: ColumnGrouping | ColumnRegular,
): colData is ColumnGrouping {
  return !!(colData as ColumnGrouping).children;
}

/**
 * This function is used to create a collection of columns.
 */
export function getColumns(
  columns: ColumnData,
  level = 0,
  types?: ColumnTypes,
): ColumnCollection {
  const collection: ColumnCollection = {
    // columns as they are in stores per type
    columns: {
      rgCol: [],
      colPinStart: [],
      colPinEnd: [],
    },
    // columns indexed by prop for quick access
    columnByProp: {},
    // column grouping
    columnGrouping: {
      rgCol: [],
      colPinStart: [],
      colPinEnd: [],
    },
    // max depth level for column grouping
    maxLevel: level,
    // sorting
    sort: {},
  };

  return reduce(
    columns,
    (res: ColumnCollection, colData: ColumnGrouping | ColumnRegular) => {
      // Grouped column
      if (isColGrouping(colData)) {
        return gatherGroup(
          res,
          colData,
          getColumns(colData.children, level + 1, types),
          level,
        );
      }
      // Regular column
      const regularColumn = {
        ...(colData.columnType && types && types[colData.columnType]),
        ...colData,
      };
      // Regular column, no Pin
      if (!regularColumn.pin) {
        res.columns.rgCol.push(regularColumn);
        // Pin
      } else {
        res.columns[regularColumn.pin].push(regularColumn);
      }
      if (regularColumn.order) {
        res.sort[regularColumn.prop] = regularColumn;
      }
      // it's possible that some columns have same prop, but better to avoid it
      if (!res.columnByProp[regularColumn.prop]) {
        res.columnByProp[regularColumn.prop] = [];
      }
      res.columnByProp[regularColumn.prop].push(regularColumn);

      // trigger setup hook if present
      regularColumn.beforeSetup && regularColumn.beforeSetup(regularColumn);
      return res;
    },
    collection,
  );
}

export function gatherGroup<T extends ColumnCollection>(
  res: T,
  colData: ColumnGrouping,
  collection: T,
  level = 0,
): T {
  // group template
  const group: ColumnGroup = {
    ...colData,
    level,
    ids: [],
  };

  // check columns for update
  for (let k in collection.columns) {
    const key = k as keyof ColumnCollection['columns'];
    const resultItem = res.columns[key];
    const collectionItem = collection.columns[key];

    // if column data
    if (isArray(resultItem) && isArray(collectionItem)) {
      // fill columns
      resultItem.push(...collectionItem);

      // fill grouping
      if (collectionItem.length) {
        res.columnGrouping[key].push({
          ...group,
          ids: collectionItem.map(item => item.prop),
        });
      }
    }
  }
  // merge column groupings
  for (let k in collection.columnGrouping) {
    const key = k as DimensionCols;
    const collectionItem = collection.columnGrouping[key];
    res.columnGrouping[key].push(...collectionItem);
  }
  res.maxLevel = Math.max(res.maxLevel, collection.maxLevel);
  res.sort = { ...res.sort, ...collection.sort };
  return res;
}

function findColumn(
  columns: ColumnData,
  prop: ColumnProp,
): ColumnRegular | undefined {
  for (const c of columns) {
    if (isColGrouping(c)) {
      const found = findColumn(c.children, prop);
      if (found) {
        return found;
      }
    } else if (c.prop === prop) {
      return c;
    }
  }
  return undefined;
}

export function getColumnByProp(
  columns: ColumnData,
  prop: ColumnProp,
): ColumnRegular | undefined {
  return findColumn(columns, prop);
}
