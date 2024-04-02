const mineflayer = require('mineflayer');
const creds = require('./credentials.js');
const { pathfinder, Movements, goals: { GoalGetToBlock } } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3');


const bot = mineflayer.createBot(creds);

bot.loadPlugin(pathfinder)

bot.on('chat', (username, message) => {
    if (username === bot.username) return
    switch (true) {
        case /^list$/.test(message):
            sayItems()
            break
        case /^chest$/.test(message):
            indexChest()
            break

    }
})

function sayItems(items = bot.inventory.items()) {
    const output = items.map(itemToString).join(', ')
    if (output) {
        bot.chat(output)
    } else {
        bot.chat('empty')
    }
}

//x y z
// north: right - x, left - x-1
// south: right - x, left - x+1
// east:  right - z, left - z-1
// west:  right - z, left - z+1
function getPairedChest(block) {
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

function containsVec3(arr, needle){
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

function getChests() {
    let chests = [];
    let blocks = ['chest', 'trapped_chest'];
    let chestsLoc = bot.findBlocks({
        matching: blocks.map(name => bot.registry.blocksByName[name].id),
        maxDistance: 15,
        count: 64
    });

    chestPairs = [];
    for (const chestLoc of chestsLoc) {
        let block = bot.blockAt(chestLoc);

        if (block.type == 'single') {
            chests.push(block);
        } else {
            chestPair = getPairedChest(block);

            if(!containsVec3(chestPairs, chestLoc)){
                chestPairs.push(chestPair);
                chests.push(block);
            }
            
        }
    }

    return chests;
}


async function indexChest() {
    const defaultMove = new Movements(bot);
    let chests = getChests();
    bot.pathfinder.setMovements(defaultMove)

    for(const chestToOpen of chests){
        await bot.pathfinder.goto(new GoalGetToBlock(chestToOpen.position.x, chestToOpen.position.y, chestToOpen.position.z))  
        let chest = await bot.openContainer(chestToOpen);
        sayItems(chest.containerItems());
        chest.close();
    }


}


function itemToString(item) {
    if (item) {
        return `${item.name} x ${item.count}`
    } else {
        return '(nothing)'
    }
}

function itemByType(items, type) {
    let item
    let i
    for (i = 0; i < items.length; ++i) {
        item = items[i]
        if (item && item.type === type) return item
    }
    return null
}

function itemByName(items, name) {
    let item
    let i
    for (i = 0; i < items.length; ++i) {
        item = items[i]
        if (item && item.name === name) return item
    }
    return null
}