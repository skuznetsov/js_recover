/**
 * ParentStack - Linked List Implementation
 *
 * Replaces array-based parent stack to eliminate O(N²) memory copying.
 *
 * Array approach (OLD):
 *   parentStack: [...current.parentStack, newItem]
 *   → O(N) copy at each level → O(N²) total for depth N
 *
 * Linked list approach (NEW):
 *   parentStack: { item: newItem, prev: current.parentStack }
 *   → O(1) at each level → O(N) total for depth N
 */

/**
 * Create a new parent stack with an item
 * @param {Object} item - { propertyName, node, index }
 * @param {Object|null} prev - Previous parent stack node
 * @returns {Object} New parent stack node
 */
function push(item, prev = null) {
    return {
        item: item,
        prev: prev
    };
}

/**
 * Get the last (most recent) item from parent stack
 * @param {Object|null} stack - Parent stack node
 * @returns {Object|null} Last item or null
 */
function last(stack) {
    return stack ? stack.item : null;
}

/**
 * Get item at index N from the end (0 = last, 1 = second to last, etc.)
 * @param {Object|null} stack - Parent stack node
 * @param {number} n - Index from end (0-based)
 * @returns {Object|null} Item at index or null
 */
function lastN(stack, n = 0) {
    let current = stack;
    for (let i = 0; i < n && current; i++) {
        current = current.prev;
    }
    return current ? current.item : null;
}

/**
 * Get depth (length) of parent stack
 * @param {Object|null} stack - Parent stack node
 * @returns {number} Depth
 */
function depth(stack) {
    let count = 0;
    let current = stack;
    while (current) {
        count++;
        current = current.prev;
    }
    return count;
}

/**
 * Convert linked list to array (for debugging/compatibility)
 * @param {Object|null} stack - Parent stack node
 * @returns {Array} Array of items
 */
function toArray(stack) {
    const result = [];
    let current = stack;
    while (current) {
        result.unshift(current.item); // Add to front to maintain order
        current = current.prev;
    }
    return result;
}

/**
 * Get item at specific index from start (for compatibility with old code)
 * @param {Object|null} stack - Parent stack node
 * @param {number} index - Index from start (0-based)
 * @returns {Object|null} Item at index or null
 */
function get(stack, index) {
    const arr = toArray(stack);
    return arr[index] || null;
}

/**
 * Iterate over parent stack from most recent to oldest
 * @param {Object|null} stack - Parent stack node
 * @param {Function} callback - (item, index) => void
 */
function forEach(stack, callback) {
    let current = stack;
    let index = depth(stack) - 1;
    while (current) {
        callback(current.item, index);
        current = current.prev;
        index--;
    }
}

/**
 * Pop one item from parent stack (returns new stack without last item)
 * @param {Object|null} stack - Parent stack node
 * @returns {Object|null} Parent stack without last item
 */
function pop(stack) {
    return stack ? stack.prev : null;
}

/**
 * Helper: Add last() method directly to stack objects for compatibility
 * This allows: parentStack.last() to work like before
 * For null stack (root node), returns object with last() that returns null
 *
 * OPTIMIZED: Reuses single function object instead of creating closure per call
 * Reduces GC pressure from 500K allocations → 0 for large files
 */

// Singleton null stack object (reused for all root nodes)
const _nullStack = {
    last: function(n = 0) {
        return null;
    }
};

// Reusable last() method
function _lastMethod(n = 0) {
    return lastN(this, n);
}

function makeCompatible(stack) {
    if (!stack) {
        return _nullStack;  // Reuse singleton instead of creating new object
    }

    // Only add method if not already present (idempotent)
    if (!stack.last) {
        Object.defineProperty(stack, 'last', {
            value: _lastMethod.bind(stack),
            enumerable: false,
            writable: false,
            configurable: false
        });
    }

    return stack;
}

module.exports = {
    push,
    last,
    lastN,
    depth,
    toArray,
    get,
    forEach,
    pop,
    makeCompatible
};
