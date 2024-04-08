const mineflayer = require('mineflayer');
const creds = require('./credentials.js');
const { pathfinder, Movements, goals: { GoalNear } } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3');


const bot = mineflayer.createBot(creds);

bot.loadPlugin(pathfinder)

bot.on('chat', (username, message) => {
    if (username === bot.username) return
    switch (true) {
        case /^list$/.test(message):
            sayItems()
            break
        case /^index$/.test(message):
            indexChest()
            break
    }
})


/**
 * Prints all Items to the console
 * @param {Item[]} items - An array of items
 */
function sayItems (items = bot.inventory.items()) {
    const output = items.map(itemToString).join(', ')
    if (output) {
        //bot.chat(output);
        console.log("[Storage Bot] " + output);
    } else {
        //bot.chat('empty');
        console.log("[Storage Bot] empty");
    }
}


//x y z
// north: right - x, left - x-1
// south: right - x, left - x+1
// east:  right - z, left - z-1
// west:  right - z, left - z+1
/**
 * Gets the the paired chests location for connected chests
 * @param {Block} block - a block object of a chest
 * @returns {Vec3} - chest pair position
 */
function getPairedChest (block) {
    const facing = block.getProperties().facing;
    const type = block.getProperties().type;
    const x = block.position.x;
    const y = block.position.y;
    const z = block.position.z;

    if (facing == 'north') {
        if (type == 'right')
            return new Vec3(x - 1, y, z);
        return new Vec3(x + 1, y, z);
    } else if (facing == 'south') {
        if (type == 'right')
            return new Vec3(x + 1, y, z);
        return new Vec3(x - 1, y, z);
    } else if (facing == 'east') {
        if (type == 'right')
            return new Vec3(x, y, z - 1);
        return new Vec3(x, y, z + 1);
    } else if (facing == 'west') {
        if (type == 'right')
            return new Vec3(x, y, z + 1);
        return new Vec3(x, y, z - 1);
    }
    return null;
}


/**
 * checks if an array contains a vec3 for a coordinate.
 * @param {Vec3[]} arr - array to compare to
 * @param {Vec3} needle - vec3 to look for
 * @returns {boolean} - true if the array contains. False otherwise.
 */
function containsVec3 (arr, needle){
    if(arr.length == 0){
        return false;
    }
    for(const vec of arr){
        if(needle.equals(vec)){
            return true;
        }
    }
    return false;
}


/**
 * Formats a chest into [L,R] or [Chest] or null
 * @param {Block} block - chest to format
 * @returns {Block[]} - returns an array of blocks or block. and null if cant
 */
function formatChestPair (block) {
    const type = block.getProperties().type;

    if (type == 'single') {
        return [block];
    } else {
        chestPair = getPairedChest(block);

        if(!containsVec3(chestPairs, block.position)){
            chestPairs.push(chestPair);

            if(type == "left")
                return [block, bot.blockAt(chestPair)];
            else if (type == "right")
                return [bot.blockAt(chestPair), block];
            else 
                console.log("[Storage Bot] Invalid blocktype was thrown: " + type);
        }
    }
    return null;
}


// Gets up to 64 chests within a 15 block radius
// Returns an array of chests.[[single chest], [left chest,right chest]]
// the first item will always be the last found trapped chest, which will be the interacting chest
function getChests() {
    let chests = [];
    let blocks = ['chest', 'trapped_chest'];
    let chestsLoc = bot.findBlocks({
        matching: blocks.map(name => bot.registry.blocksByName[name].id),
        maxDistance: 15,
        count: 64
    });

    chests.push(null);

    chestPairs = [];
    for (const chestLoc of chestsLoc) {
        let block = bot.blockAt(chestLoc);

        let chestPair = formatChestPair(block);
        if(chestPair != null) {
            switch(block.name){
                case "chest":
                    chests.push(chestPair);
                    break;
                case "trapped_chest":
                    chests[0] = chestPair;
            }
        }
    }
    //console.log(chests);
    return chests;
}


// chest [leftblock, rightblock] or [single]
async function moveToChest(chestToOpen){
    bot.pathfinder.setMovements(makeStrictMove());

    let i = 0; // selects left chest to start
    let x = chestToOpen[i].position.x;
    let y = chestToOpen[i].position.y;
    let z = chestToOpen[i].position.z;
    try {
        //console.log(`[Storage Bot] Traveling to (${x}, ${y}, ${z})`);
        await bot.pathfinder.goto(new GoalNear(x, y, z, 2));
    } catch (error) {
        // switch to right chest
        if (chestToOpen.length > 1) {
            i += 1;
            x = chestToOpen[i].position.x;
            y = chestToOpen[i].position.y;
            z = chestToOpen[i].position.z;

            //console.log(`[Storage Bot] Error now traveling to (${x}, ${y}, ${z})`);
            await bot.pathfinder.goto(new GoalNear(x, y, z, 2));
        }else {
            console.log(`[Storage Bot] Error traveling to (${x}, ${y}, ${z}) SKIPPING`);
            return false;
        }
    }
    return true;
}


async function indexChest() {
    const itemLocations = new Map();

    let chests = getChests();
    for(let i = 1; i < chests.length; i++){
        await moveToChest(chests[i]);
        
        let chest = await bot.openContainer(chests[i][0]);

        for(const item of chest.containerItems()) {
            let itemLocobj;

            if(itemLocations.has(item.name)){
                itemLocobj = itemLocations.get(item.name);
                itemLocobj.chests.push(i);
                itemLocobj.counts.push(item.count);
                itemLocobj.slots.push(item.slot);
                
            }else {
                itemLocations.set(item.name, {  "chests":     [i],
                                                "counts":     [item.count],
                                                "slots":      [item.slot],
                                                "stackSize":   item.stackSize,
                                                "type":        item.type});
            }
        }
        chest.close();
    }
    watchChest(chests, itemLocations);
}


async function watchChest (chests, itemLocations) {
    
    await moveToChest(chests[0]);
    const chest = await bot.openContainer(chests[0][0]);

    chest.on('updateSlot', (slot, oldItem, newItem) => {
      console.log(`[Storage Bot] chest update: ${itemToString(oldItem)} -> ${itemToString(newItem)} (slot: ${slot})`)
    })

    bot.on('chat', onChat)
  
    function onChat (username, message) {
      if (username === bot.username) return
      const command = message.split(' ')
      switch (true) {

        case /^store$/.test(message):
          storeItems();
          break;
        case /^get \d+ \w+$/.test(message):
          // deposit amount name
          // ex: get 16 stick
          getItem(command[2], command[1]);
          break;
      }
    }


    // TODO: finish
    async function getItem (name, amount) {
        let itemlocation = itemLocations.get(name);
        // move to first chest withdraw the amount
        // if the amount of items in chest is >= amount then either take the whole stack or partial and update item loctions
        // else move to next chest and repeat process above
    }
  

    // store items
    // TODO: Plan and finish
    async function storeItems () {
        bot.inventory.items()
    }
  }


// returns Movement
function makeStrictMove(){
    const strictMove = new Movements(bot);
    strictMove.canDig = false;
    strictMove.allow1by1towers = false;
    return strictMove;
}


function itemToString(item) {
    if (item) {
        return `${item.name} x ${item.count}`;
    } else {
        return '(nothing)';
    }
}


function itemByType(items, type) {
    let item;
    let i;
    for (i = 0; i < items.length; ++i) {
        item = items[i];
        if (item && item.type === type) return item;
    }
    return null;
}


function itemByName(items, name) {
    let item;
    let i;
    for (i = 0; i < items.length; ++i) {
        item = items[i];
        if (item && item.name === name) return item;
    }
    return null;
}