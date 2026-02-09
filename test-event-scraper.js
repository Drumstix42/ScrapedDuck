const fs = require('fs');
const event = require('./pages/detailed/event');

// Test URLs to parse - test both types of events
const testEvents = [
    {
        id: 'enchanted-hollow-2025',
        url: 'https://leekduck.com/events/enchanted-hollow-2025/',
        name: 'Enchanted Hollow 2025'
    },
    {
        id: 'into-the-wild-2025', 
        url: 'https://leekduck.com/events/into-the-wild-2025/',
        name: 'Into the Wild 2025'
    },
    {
        id: 'into-the-wild', 
        url: 'https://leekduck.com/events/into-the-wild/',
        name: 'Into the Wild'
    },
    {
        id: 'pokemon-go-fest-2024-global',
        url: 'https://leekduck.com/events/pokemon-go-fest-2024-global/',
        name: 'Pokemon GO Fest 2024 Global'
    },
    {
        id: 'pokemon-go-fest-2025-global',
        url: 'https://leekduck.com/events/pokemon-go-fest-2025-global/',
        name: 'Pokemon GO Fest 2025 Global'
    },
    {
        id: 'high-voltage-2025',
        url: 'https://leekduck.com/events/high-voltage-2025/',
        name: 'High Voltage',
    },
    {
        id: 'road-to-kalos',
        url: 'https://leekduck.com/events/road-to-kalos/',
        name: 'Road to Kalos'
    }
];

// Mock backup data (empty for testing)
const mockBkp = [];

async function runTests() {
    console.log('🧪 Testing Event Scraper\n');
    
    // Create temp directory if it doesn't exist
    if (!fs.existsSync('files/temp')) {
        fs.mkdirSync('files/temp', { recursive: true });
    }

    for (const testEvent of testEvents) {
        console.log(`📋 Testing: ${testEvent.name}`);
        console.log(`🌐 URL: ${testEvent.url}`);
        
        try {
            console.log('🔄 Starting scrape...');
            // Run the event scraper
            await event.get(testEvent.url, testEvent.id, mockBkp);
            console.log('✅ Scrape function completed');
            
            // Check if temp file was created
            const tempFilePath = `files/temp/${testEvent.id}.json`;
            console.log(`🔍 Checking for file: ${tempFilePath}`);
            
            if (fs.existsSync(tempFilePath)) {
                const rawContent = fs.readFileSync(tempFilePath, 'utf8');
                console.log(`📄 Raw file content (${rawContent.length} chars): ${rawContent.substring(0, 200)}...`);
                
                if (rawContent.length === 0) {
                    console.log('❌ File is empty - scraper may have failed silently');
                    continue;
                }
                
                let data;
                try {
                    data = JSON.parse(rawContent);
                } catch (parseError) {
                    console.log(`❌ JSON Parse Error: ${parseError.message}`);
                    console.log(`📄 Full raw content:\n${rawContent}`);
                    continue;
                }
                
                console.log('✅ Successfully scraped!');
                console.log(`📄 Raw data structure:`);
                console.log(`   - ID: ${data.id}`);
                console.log(`   - Type: ${data.type}`);
                
                // Transform to final form like combinedetails.js does
                // Note: some placeholder data below -- in real events.json, these fields come from scrape.js base event data
                const mockEvent = {
                    eventID: data.id,
                    name: testEvent.name,
                    eventType: data.type,
                    heading: data.type === "event" ? "Event" : 
                             data.type === "season" ? "Season" :
                             data.type === "raid-battles" ? "Raid Battles" :
                             data.type === "pokemon-spotlight-hour" ? "Pokémon Spotlight Hour" :
                             data.type === "community-day" ? "Community Day" :
                             data.type,
                    link: testEvent.url,
                    image: "https://cdn.leekduck.com/assets/img/events/events-default-img.jpg",
                    start: "...",
                    end: "...",
                    extraData: {}
                };
                
                // Simulate combinedetails.js logic
                if (data.type === "event") {
                    // Flattened structure for event type
                    if (data.data.raidSchedule) {
                        mockEvent.extraData.raidSchedule = data.data.raidSchedule;
                    }
                    if (data.data.raidbattles) {
                        mockEvent.extraData.raidbattles = data.data.raidbattles;
                    }
                } else if (data.type === "raid-battles") {
                    mockEvent.extraData.raidbattles = data.data;
                } else if (data.type === "pokemon-spotlight-hour") {
                    mockEvent.extraData.spotlight = data.data;
                } else if (data.type === "community-day") {
                    mockEvent.extraData.communityday = data.data;
                } else if (data.type === "research-breakthrough") {
                    mockEvent.extraData.breakthrough = data.data;
                }
                
                // Pretty print the transformed data
                console.log('\n📊 Final Form (as it appears in events.json):');
                console.log(JSON.stringify(mockEvent, null, 4));
                
            } else {
                console.log('❌ No temp file created - scraping may have failed');
            }
            
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
        }
        
        console.log('\n' + '='.repeat(60) + '\n');
    }
    
    console.log('🧹 Cleaning up temp files...');
    // Clean up temp files
    testEvents.forEach(testEvent => {
        const tempFilePath = `files/temp/${testEvent.id}.json`;
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
            console.log(`🗑️  Removed ${tempFilePath}`);
        }
    });
    
    console.log('✨ Test complete!');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Test interrupted, cleaning up...');
    process.exit(0);
});

// Run the tests
runTests().catch(error => {
    console.error('💥 Test runner failed:', error);
    process.exit(1);
});